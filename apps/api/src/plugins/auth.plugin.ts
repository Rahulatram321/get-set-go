import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AuthService } from '../services/auth.service.js';
import type { ApiKeyService } from '../services/api-key.service.js';
import { AuthenticationError } from '@orbitqueue/shared';

declare module 'fastify' {
  interface FastifyContextConfig {
    public?: boolean;
  }
  interface FastifyInstance {
    authService: AuthService;
    apiKeyService: ApiKeyService;
  }
}

export async function authPlugin(app: FastifyInstance) {
  app.decorateRequest('userId', undefined);
  app.decorateRequest('userEmail', undefined);
  app.decorateRequest('apiKeyProjectId', undefined);
  app.decorateRequest('apiKeyProjectId', undefined);

  app.addHook('preHandler', async (request: FastifyRequest) => {
    if (request.routeOptions.config?.public) return;

    const publicPaths = ['/health', '/metrics', '/docs', '/ws', '/auth/'];
    if (publicPaths.some((p) => request.url.startsWith(p))) return;

    const authHeader = request.headers.authorization;
    const apiKeyHeader = request.headers['x-api-key'] as string | undefined;

    if (apiKeyHeader || authHeader?.startsWith('Bearer oq_')) {
      const rawKey = apiKeyHeader ?? authHeader!.slice(7);
      const auth = await app.apiKeyService.authenticate(rawKey);
      if (!auth) throw new AuthenticationError('Invalid API key');
      request.userId = auth.userId;
      request.apiKeyProjectId = auth.projectId ?? undefined;
      return;
    }

    if (!authHeader?.startsWith('Bearer ')) {
      throw new AuthenticationError();
    }

    const token = authHeader.slice(7);
    const payload = app.authService.verifyAccessToken(token);
    request.userId = payload.userId;
    request.userEmail = payload.email;
  });
}

export function publicRoute() {
  return { config: { public: true } };
}
