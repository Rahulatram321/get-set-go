import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import websocket from '@fastify/websocket';
import { loadEnv } from '@orbitqueue/config';
import { prisma } from '@orbitqueue/database';
import { createLogger } from '@orbitqueue/logger';
import { MetricsRegistry } from '@orbitqueue/metrics';
import { createRedisClient } from '@orbitqueue/queue-core';
import { AuthService, RbacService } from './services/auth.service.js';
import { JobService } from './services/job.service.js';
import { AiFailureAnalysisService } from './services/ai.service.js';
import { ApiKeyService } from './services/api-key.service.js';
import { MemberService } from './services/member.service.js';
import { WorkflowService } from './services/workflow.service.js';
import { eventBus } from './services/event-bus.js';
import { registerRoutes } from './routes/index.js';
import { registerExtendedRoutes } from './routes/extended.js';
import { errorHandler, requestIdHook } from './plugins/error-handler.js';
import { authPlugin } from './plugins/auth.plugin.js';
import { rateLimitPlugin } from './plugins/rate-limit.plugin.js';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: typeof prisma;
    redis: ReturnType<typeof createRedisClient>;
    metrics: MetricsRegistry;
    authService: AuthService;
    rbac: RbacService;
    jobService: JobService;
    aiService: AiFailureAnalysisService;
    apiKeyService: ApiKeyService;
    memberService: MemberService;
    workflowService: WorkflowService;
  }

  interface FastifyRequest {
    apiKeyProjectId?: string;
  }
}

export async function buildApp() {
  const env = loadEnv();
  const logger = createLogger({ name: 'orbitqueue-api', level: env.LOG_LEVEL });

  const app = Fastify({
    logger: logger as Parameters<typeof Fastify>[0]['logger'],
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });

  const redis = createRedisClient(env.REDIS_URL);
  try {
    await redis.connect();
  } catch {
    app.log.warn('Redis not available at startup');
  }

  const metrics = new MetricsRegistry();
  const authService = new AuthService(prisma, env);
  const rbac = new RbacService(prisma);
  const jobService = new JobService(prisma);
  const aiService = new AiFailureAnalysisService(env);
  const apiKeyService = new ApiKeyService(prisma);
  const memberService = new MemberService(prisma);
  const workflowService = new WorkflowService(prisma);

  app.decorate('prisma', prisma);
  app.decorate('redis', redis);
  app.decorate('metrics', metrics);
  app.decorate('authService', authService);
  app.decorate('rbac', rbac);
  app.decorate('jobService', jobService);
  app.decorate('aiService', aiService);
  app.decorate('apiKeyService', apiKeyService);
  app.decorate('memberService', memberService);
  app.decorate('workflowService', workflowService);

  await app.register(cors, { origin: env.WEB_URL, credentials: true });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cookie);
  await app.register(websocket);

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'OrbitQueue API',
        description: 'Reliable background execution for modern systems',
        version: '1.0.0',
      },
      servers: [{ url: env.API_URL }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
  });

  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.addHook('onRequest', async (request) => {
    requestIdHook(request);
  });

  app.addHook('onResponse', async (request, reply) => {
    metrics.increment('http_requests_total', {
      method: request.method,
      route: request.routeOptions.url ?? 'unknown',
      status: String(reply.statusCode),
    });
    metrics.observe('http_request_duration_ms', reply.elapsedTime, {
      route: request.routeOptions.url ?? 'unknown',
    });
  });

  app.setErrorHandler(errorHandler);

  // WebSocket for live updates
  app.register(async (wsApp) => {
    wsApp.get('/ws', { websocket: true }, (socket, request) => {
      const url = new URL(request.url, 'http://localhost');
      const projectId = url.searchParams.get('projectId') ?? undefined;
      const client = socket as typeof socket & { projectId?: string };
      client.projectId = projectId;
      eventBus.addClient(client);

      socket.on('close', () => eventBus.removeClient(client));
      socket.send(JSON.stringify({ event: 'CONNECTED', data: { projectId } }));
    });
  });

  await rateLimitPlugin(app, env);
  await authPlugin(app);
  await registerRoutes(app);
  await registerExtendedRoutes(app);

  app.addHook('onClose', async () => {
    await redis.quit();
    await prisma.$disconnect();
  });

  return { app, env };
}
