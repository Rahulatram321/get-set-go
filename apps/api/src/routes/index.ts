import type { FastifyInstance } from 'fastify';
import { successResponse, paginationMeta } from '@orbitqueue/shared';
import {
  registerSchema,
  loginSchema,
  createOrgSchema,
  createProjectSchema,
  createQueueSchema,
  createJobSchema,
  batchJobsSchema,
  jobFilterSchema,
  paginationSchema,
} from '@orbitqueue/validation';
import { publicRoute } from '../plugins/auth.plugin.js';
import { eventBus } from '../services/event-bus.js';

export async function registerRoutes(app: FastifyInstance) {
  // Health
  app.get('/health', publicRoute(), async () => ({
    success: true,
    data: { status: 'ok', service: 'orbitqueue-api', timestamp: new Date().toISOString() },
  }));

  app.get('/health/liveness', publicRoute(), async () => ({
    success: true,
    data: { alive: true },
  }));

  app.get('/health/readiness', publicRoute(), async () => {
    const checks: Record<string, boolean> = {};
    try {
      await app.prisma.$queryRaw`SELECT 1`;
      checks.postgres = true;
    } catch {
      checks.postgres = false;
    }
    try {
      await app.redis.ping();
      checks.redis = true;
    } catch {
      checks.redis = false;
    }
    const ready = Object.values(checks).every(Boolean);
    return {
      success: ready,
      data: { ready, checks },
    };
  });

  app.get('/metrics', publicRoute(), async (_req, reply) => {
    reply.type('text/plain');
    return app.metrics.toPrometheus();
  });

  // Auth
  app.post('/auth/register', publicRoute(), async (request) => {
    const body = registerSchema.parse(request.body);
    const result = await app.authService.register(body.email, body.password, body.name);
    return successResponse(result);
  });

  app.post('/auth/login', publicRoute(), async (request) => {
    const body = loginSchema.parse(request.body);
    const result = await app.authService.login(body.email, body.password);
    return successResponse(result);
  });

  app.post('/auth/logout', async (request) => {
    const { refreshToken } = request.body as { refreshToken?: string };
    if (refreshToken) await app.authService.logout(refreshToken);
    return successResponse({ loggedOut: true });
  });

  app.post('/auth/refresh', publicRoute(), async (request) => {
    const { refreshToken } = request.body as { refreshToken: string };
    const tokens = await app.authService.refresh(refreshToken);
    return successResponse(tokens);
  });

  app.get('/auth/me', async (request) => {
    const user = await app.prisma.user.findUnique({
      where: { id: request.userId! },
      select: { id: true, email: true, name: true, avatarUrl: true, createdAt: true },
    });
    return successResponse(user);
  });

  // Organizations
  app.get('/organizations', async (request) => {
    const orgs = await app.prisma.organization.findMany({
      where: { members: { some: { userId: request.userId! } } },
      include: { _count: { select: { projects: true, members: true } } },
    });
    return successResponse(orgs);
  });

  app.post('/organizations', async (request) => {
    const body = createOrgSchema.parse(request.body);
    const org = await app.prisma.organization.create({
      data: {
        name: body.name,
        slug: body.slug,
        description: body.description,
        members: { create: { userId: request.userId!, role: 'ADMIN' } },
      },
    });
    await app.prisma.auditLog.create({
      data: {
        userId: request.userId,
        action: 'ORG_CREATED',
        resource: 'organization',
        resourceId: org.id,
      },
    });
    return successResponse(org);
  });

  // Projects
  app.get('/organizations/:orgId/projects', async (request) => {
    const { orgId } = request.params as { orgId: string };
    await app.rbac.checkOrgAccess(request.userId!, orgId);
    const projects = await app.prisma.project.findMany({
      where: { organizationId: orgId, archivedAt: null },
      include: { _count: { select: { queues: true, jobs: true } } },
    });
    return successResponse(projects);
  });

  app.post('/organizations/:orgId/projects', async (request) => {
    const { orgId } = request.params as { orgId: string };
    await app.rbac.checkOrgAccess(request.userId!, orgId, 'DEVELOPER');
    const body = createProjectSchema.parse(request.body);
    const project = await app.prisma.project.create({
      data: { organizationId: orgId, name: body.name, slug: body.slug, description: body.description },
    });
    await app.prisma.projectMember.create({
      data: { projectId: project.id, userId: request.userId!, role: 'ADMIN' },
    });
    return successResponse(project);
  });

  app.get('/projects/:projectId', async (request) => {
    const { projectId } = request.params as { projectId: string };
    await app.rbac.checkProjectAccess(request.userId!, projectId);
    const project = await app.prisma.project.findUnique({
      where: { id: projectId },
      include: { organization: true, _count: { select: { queues: true, jobs: true } } },
    });
    return successResponse(project);
  });

  app.get('/projects/:projectId/dashboard', async (request) => {
    const { projectId } = request.params as { projectId: string };
    await app.rbac.checkProjectAccess(request.userId!, projectId);

    const [jobStats, workers, dlqCount, recentFailures] = await Promise.all([
      app.prisma.job.groupBy({
        by: ['status'],
        where: { projectId },
        _count: true,
      }),
      app.prisma.worker.findMany({
        where: { status: { not: 'STOPPED' } },
        orderBy: { lastHeartbeat: 'desc' },
        take: 20,
      }),
      app.prisma.deadLetterJob.count({
        where: { queue: { projectId } },
      }),
      app.prisma.job.findMany({
        where: { projectId, status: 'FAILED' },
        orderBy: { failedAt: 'desc' },
        take: 10,
        include: { queue: { select: { name: true } } },
      }),
    ]);

    const stats = Object.fromEntries(jobStats.map((s) => [s.status, s._count]));
    const completed = stats.COMPLETED ?? 0;
    const failed = stats.FAILED ?? 0;
    const total = Object.values(stats).reduce((a, b) => a + b, 0);

    return successResponse({
      stats,
      workers: workers.map((w) => ({
        ...w,
        health: Date.now() - w.lastHeartbeat.getTime() < 30000 ? 'healthy' : 'unhealthy',
      })),
      dlqCount,
      recentFailures,
      metrics: {
        successRate: total > 0 ? (completed / total) * 100 : 100,
        failureRate: total > 0 ? (failed / total) * 100 : 0,
        throughput: completed,
      },
    });
  });

  // Queues
  app.get('/projects/:projectId/queues', async (request) => {
    const { projectId } = request.params as { projectId: string };
    await app.rbac.checkProjectAccess(request.userId!, projectId);
    const queues = await app.prisma.queue.findMany({
      where: { projectId },
      include: { retryPolicy: true, rateLimit: true },
    });

    const queuesWithStats = await Promise.all(
      queues.map(async (q) => {
        const counts = await app.prisma.job.groupBy({
          by: ['status'],
          where: { queueId: q.id },
          _count: true,
        });
        const statusCounts = Object.fromEntries(counts.map((c) => [c.status, c._count]));
        return { ...q, stats: statusCounts };
      })
    );

    return successResponse(queuesWithStats);
  });

  app.post('/projects/:projectId/queues', async (request) => {
    const { projectId } = request.params as { projectId: string };
    await app.rbac.checkProjectAccess(request.userId!, projectId, 'DEVELOPER');
    const body = createQueueSchema.parse(request.body);

    let retryPolicyId: string | undefined;
    if (body.retryPolicy) {
      const policy = await app.prisma.retryPolicy.create({ data: { ...body.retryPolicy, maxAttempts: body.maxAttempts } });
      retryPolicyId = policy.id;
    }

    let rateLimitId: string | undefined;
    if (body.rateLimit) {
      const rl = await app.prisma.rateLimit.create({ data: body.rateLimit });
      rateLimitId = rl.id;
    }

    const queue = await app.prisma.queue.create({
      data: {
        projectId,
        name: body.name,
        description: body.description,
        priority: body.priority,
        concurrencyLimit: body.concurrencyLimit,
        maxAttempts: body.maxAttempts,
        retentionDays: body.retentionDays,
        retryPolicyId,
        rateLimitId,
      },
    });

    return successResponse(queue);
  });

  app.patch('/projects/:projectId/queues/:queueId/pause', async (request) => {
    const { projectId, queueId } = request.params as { projectId: string; queueId: string };
    await app.rbac.checkProjectAccess(request.userId!, projectId, 'OPERATOR');
    const queue = await app.prisma.queue.update({
      where: { id: queueId, projectId },
      data: { status: 'PAUSED' },
    });
    eventBus.emitQueuePaused(projectId, queue);
    return successResponse(queue);
  });

  app.patch('/projects/:projectId/queues/:queueId/resume', async (request) => {
    const { projectId, queueId } = request.params as { projectId: string; queueId: string };
    await app.rbac.checkProjectAccess(request.userId!, projectId, 'OPERATOR');
    const queue = await app.prisma.queue.update({
      where: { id: queueId, projectId },
      data: { status: 'ACTIVE' },
    });
    eventBus.emitQueueResumed(projectId, queue);
    return successResponse(queue);
  });

  // Jobs
  app.get('/projects/:projectId/jobs', async (request) => {
    const { projectId } = request.params as { projectId: string };
    await app.rbac.checkProjectAccess(request.userId!, projectId);
    const filters = jobFilterSchema.parse(request.query);
    const { jobs, total } = await app.jobService.listJobs(projectId, filters);
    return successResponse(jobs, { ...paginationMeta(filters.page, filters.limit, total) });
  });

  app.post('/projects/:projectId/jobs', async (request) => {
    const { projectId } = request.params as { projectId: string };
    await app.rbac.checkProjectAccess(request.userId!, projectId, 'DEVELOPER');
    const body = createJobSchema.parse(request.body);
    const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
    const job = await app.jobService.createJob(projectId, body, idempotencyKey);
    eventBus.emitJobCreated(projectId, job);
    app.metrics.increment('jobs_created_total', { project: projectId });
    return successResponse(job);
  });

  app.post('/projects/:projectId/jobs/batch', async (request) => {
    const { projectId } = request.params as { projectId: string };
    await app.rbac.checkProjectAccess(request.userId!, projectId, 'DEVELOPER');
    const body = batchJobsSchema.parse(request.body);
    const result = await app.jobService.createBatch(projectId, body.queue, body.jobs);
    return successResponse(result);
  });

  app.get('/projects/:projectId/jobs/:jobId', async (request) => {
    const { projectId, jobId } = request.params as { projectId: string; jobId: string };
    await app.rbac.checkProjectAccess(request.userId!, projectId);
    const job = await app.jobService.getJob(jobId, projectId);
    return successResponse(job);
  });

  app.post('/projects/:projectId/jobs/:jobId/retry', async (request) => {
    const { projectId, jobId } = request.params as { projectId: string; jobId: string };
    await app.rbac.checkProjectAccess(request.userId!, projectId, 'OPERATOR');
    const job = await app.jobService.retryJob(jobId, projectId);
    return successResponse(job);
  });

  app.post('/projects/:projectId/jobs/:jobId/cancel', async (request) => {
    const { projectId, jobId } = request.params as { projectId: string; jobId: string };
    await app.rbac.checkProjectAccess(request.userId!, projectId, 'OPERATOR');
    const job = await app.jobService.cancelJob(jobId, projectId);
    return successResponse(job);
  });

  app.get('/projects/:projectId/jobs/:jobId/executions', async (request) => {
    const { projectId, jobId } = request.params as { projectId: string; jobId: string };
    await app.rbac.checkProjectAccess(request.userId!, projectId);
    const executions = await app.prisma.jobExecution.findMany({
      where: { jobId, job: { projectId } },
      orderBy: { startedAt: 'desc' },
    });
    return successResponse(executions);
  });

  app.get('/projects/:projectId/jobs/:jobId/logs', async (request) => {
    const { projectId, jobId } = request.params as { projectId: string; jobId: string };
    await app.rbac.checkProjectAccess(request.userId!, projectId);
    const logs = await app.prisma.jobLog.findMany({
      where: { jobId, job: { projectId } },
      orderBy: { createdAt: 'asc' },
    });
    return successResponse(logs);
  });

  app.get('/projects/:projectId/jobs/:jobId/analyze', async (request) => {
    const { projectId, jobId } = request.params as { projectId: string; jobId: string };
    await app.rbac.checkProjectAccess(request.userId!, projectId);
    const job = await app.jobService.getJob(jobId, projectId);
    if (!job.errorMessage) return successResponse({ analysis: null });
    const analysis = await app.aiService.analyzeFailure(
      job.errorMessage,
      job.name,
      job.attemptNumber
    );
    return successResponse({ analysis });
  });

  // Workers
  app.get('/workers', async () => {
    const workers = await app.prisma.worker.findMany({
      orderBy: { lastHeartbeat: 'desc' },
      include: { _count: { select: { jobs: true, executions: true } } },
    });
    const now = Date.now();
    return successResponse(
      workers.map((w) => ({
        ...w,
        health:
          w.status === 'STOPPED'
            ? 'offline'
            : now - w.lastHeartbeat.getTime() < 15000
              ? 'healthy'
              : now - w.lastHeartbeat.getTime() < 30000
                ? 'warning'
                : 'offline',
      }))
    );
  });

  app.get('/workers/:id', async (request) => {
    const { id } = request.params as { id: string };
    const worker = await app.prisma.worker.findFirst({
      where: { OR: [{ id }, { workerId: id }] },
      include: {
        heartbeats: { orderBy: { timestamp: 'desc' }, take: 50 },
        executions: { orderBy: { startedAt: 'desc' }, take: 20, include: { job: true } },
      },
    });
    return successResponse(worker);
  });

  // DLQ
  app.get('/projects/:projectId/dlq', async (request) => {
    const { projectId } = request.params as { projectId: string };
    await app.rbac.checkProjectAccess(request.userId!, projectId);
    const query = paginationSchema.parse(request.query);
    const where = { queue: { projectId } };
    const [items, total] = await Promise.all([
      app.prisma.deadLetterJob.findMany({
        where,
        orderBy: { failedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: { queue: { select: { name: true } }, job: true },
      }),
      app.prisma.deadLetterJob.count({ where }),
    ]);
    return successResponse(items, { ...paginationMeta(query.page, query.limit, total) });
  });

  app.post('/projects/:projectId/dlq/:dlqId/retry', async (request) => {
    const { projectId, dlqId } = request.params as { projectId: string; dlqId: string };
    await app.rbac.checkProjectAccess(request.userId!, projectId, 'OPERATOR');
    const dlq = await app.prisma.deadLetterJob.findFirst({
      where: { id: dlqId, queue: { projectId } },
    });
    if (!dlq) throw new Error('DLQ job not found');
    const job = await app.jobService.retryJob(dlq.jobId, projectId);
    return successResponse(job);
  });

  // Audit logs
  app.get('/projects/:projectId/audit-logs', async (request) => {
    const { projectId } = request.params as { projectId: string };
    await app.rbac.checkProjectAccess(request.userId!, projectId);
    const query = paginationSchema.parse(request.query);
    const [logs, total] = await Promise.all([
      app.prisma.auditLog.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: { user: { select: { name: true, email: true } } },
      }),
      app.prisma.auditLog.count({ where: { projectId } }),
    ]);
    return successResponse(logs, { ...paginationMeta(query.page, query.limit, total) });
  });

  // Metrics
  app.get('/projects/:projectId/metrics', async (request) => {
    const { projectId } = request.params as { projectId: string };
    await app.rbac.checkProjectAccess(request.userId!, projectId);
    const range = (request.query as { range?: string }).range ?? '1h';
    const hours = range === '24h' ? 24 : range === '7d' ? 168 : range === '6h' ? 6 : 1;
    const since = new Date(Date.now() - hours * 3600000);

    const metrics = await app.prisma.queueMetric.findMany({
      where: { queue: { projectId }, timestamp: { gte: since } },
      orderBy: { timestamp: 'asc' },
      include: { queue: { select: { name: true } } },
    });

    return successResponse(metrics);
  });

  // System events
  app.get('/system/events', async (request) => {
    const query = paginationSchema.parse(request.query);
    const [events, total] = await Promise.all([
      app.prisma.systemEvent.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      app.prisma.systemEvent.count(),
    ]);
    return successResponse(events, { ...paginationMeta(query.page, query.limit, total) });
  });
}
