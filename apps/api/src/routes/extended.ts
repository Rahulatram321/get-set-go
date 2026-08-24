import type { FastifyInstance } from 'fastify';
import { successResponse, paginationMeta, NotFoundError } from '@orbitqueue/shared';
import {
  inviteMemberSchema,
  updateQueueSchema,
  createApiKeySchema,
  createWorkflowSchema,
  paginationSchema,
} from '@orbitqueue/validation';
import { eventBus } from '../services/event-bus.js';

export async function registerExtendedRoutes(app: FastifyInstance) {
  // Organization members
  app.get('/organizations/:orgId/members', async (request) => {
    const { orgId } = request.params as { orgId: string };
    await app.rbac.checkOrgAccess(request.userId!, orgId);
    const members = await app.memberService.listOrgMembers(orgId);
    return successResponse(members);
  });

  app.post('/organizations/:orgId/members/invite', async (request) => {
    const { orgId } = request.params as { orgId: string };
    await app.rbac.checkOrgAccess(request.userId!, orgId, 'ADMIN');
    const body = inviteMemberSchema.parse(request.body);
    const member = await app.memberService.inviteToOrg(orgId, body.email, body.role, request.userId!);
    return successResponse(member);
  });

  // Project members
  app.get('/projects/:projectId/members', async (request) => {
    const { projectId } = request.params as { projectId: string };
    await app.rbac.checkProjectAccess(request.userId!, projectId);
    const members = await app.memberService.listProjectMembers(projectId);
    return successResponse(members);
  });

  app.post('/projects/:projectId/members/invite', async (request) => {
    const { projectId } = request.params as { projectId: string };
    await app.rbac.checkProjectAccess(request.userId!, projectId, 'ADMIN');
    const body = inviteMemberSchema.parse(request.body);
    const member = await app.memberService.inviteToProject(projectId, body.email, body.role, request.userId!);
    return successResponse(member);
  });

  // API Keys
  app.get('/projects/:projectId/api-keys', async (request) => {
    const { projectId } = request.params as { projectId: string };
    await app.rbac.checkProjectAccess(request.userId!, projectId, 'ADMIN');
    const keys = await app.apiKeyService.list(projectId);
    return successResponse(keys);
  });

  app.post('/projects/:projectId/api-keys', async (request) => {
    const { projectId } = request.params as { projectId: string };
    await app.rbac.checkProjectAccess(request.userId!, projectId, 'ADMIN');
    const body = createApiKeySchema.parse(request.body);
    const key = await app.apiKeyService.create(request.userId!, projectId, body.name, body.expiresInDays);
    return successResponse(key);
  });

  app.delete('/projects/:projectId/api-keys/:keyId', async (request) => {
    const { projectId, keyId } = request.params as { projectId: string; keyId: string };
    await app.rbac.checkProjectAccess(request.userId!, projectId, 'ADMIN');
    const result = await app.apiKeyService.revoke(keyId, projectId);
    return successResponse(result);
  });

  // Queue extended controls
  app.patch('/projects/:projectId/queues/:queueId', async (request) => {
    const { projectId, queueId } = request.params as { projectId: string; queueId: string };
    await app.rbac.checkProjectAccess(request.userId!, projectId, 'OPERATOR');
    const body = updateQueueSchema.parse(request.body);

    const queue = await app.prisma.queue.update({
      where: { id: queueId, projectId },
      data: {
        description: body.description,
        priority: body.priority,
        concurrencyLimit: body.concurrencyLimit,
        maxAttempts: body.maxAttempts,
        retentionDays: body.retentionDays,
      },
    });

    await app.prisma.auditLog.create({
      data: {
        userId: request.userId,
        projectId,
        action: 'QUEUE_UPDATED',
        resource: 'queue',
        resourceId: queueId,
        metadata: body as object,
      },
    });

    return successResponse(queue);
  });

  app.patch('/projects/:projectId/queues/:queueId/drain', async (request) => {
    const { projectId, queueId } = request.params as { projectId: string; queueId: string };
    await app.rbac.checkProjectAccess(request.userId!, projectId, 'OPERATOR');
    const queue = await app.prisma.queue.update({
      where: { id: queueId, projectId },
      data: { status: 'DRAINING' },
    });
    return successResponse(queue);
  });

  app.post('/projects/:projectId/queues/:queueId/retry-failures', async (request) => {
    const { projectId, queueId } = request.params as { projectId: string; queueId: string };
    await app.rbac.checkProjectAccess(request.userId!, projectId, 'OPERATOR');

    const result = await app.prisma.job.updateMany({
      where: { queueId, projectId, status: { in: ['FAILED', 'RETRY_SCHEDULED'] } },
      data: { status: 'QUEUED', availableAt: new Date(), workerId: null, errorMessage: null },
    });

    await app.prisma.auditLog.create({
      data: {
        userId: request.userId,
        projectId,
        action: 'JOB_RETRIED',
        resource: 'queue',
        resourceId: queueId,
        metadata: { count: result.count },
      },
    });

    return successResponse({ retried: result.count });
  });

  app.delete('/projects/:projectId/queues/:queueId/completed', async (request) => {
    const { projectId, queueId } = request.params as { projectId: string; queueId: string };
    await app.rbac.checkProjectAccess(request.userId!, projectId, 'OPERATOR');

    const result = await app.prisma.job.deleteMany({
      where: { queueId, projectId, status: 'COMPLETED' },
    });

    return successResponse({ deleted: result.count });
  });

  // Batch progress
  app.get('/projects/:projectId/batches/:batchId', async (request) => {
    const { projectId, batchId } = request.params as { projectId: string; batchId: string };
    await app.rbac.checkProjectAccess(request.userId!, projectId);

    const jobs = await app.prisma.job.findMany({
      where: { projectId, batchId },
      select: { id: true, name: true, status: true, createdAt: true, completedAt: true },
    });

    if (jobs.length === 0) throw new NotFoundError('Batch', batchId);

    const total = jobs.length;
    const completed = jobs.filter((j) => j.status === 'COMPLETED').length;
    const failed = jobs.filter((j) => ['FAILED', 'DEAD_LETTER'].includes(j.status)).length;
    const pending = jobs.filter((j) => !['COMPLETED', 'FAILED', 'DEAD_LETTER', 'CANCELLED'].includes(j.status)).length;

    return successResponse({
      batchId,
      total,
      completed,
      failed,
      pending,
      progressPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
      jobs,
    });
  });

  app.get('/projects/:projectId/batches', async (request) => {
    const { projectId } = request.params as { projectId: string };
    await app.rbac.checkProjectAccess(request.userId!, projectId);

    const batches = await app.prisma.job.groupBy({
      by: ['batchId'],
      where: { projectId, batchId: { not: null } },
      _count: true,
    });

    const batchStats = await Promise.all(
      batches
        .filter((b) => b.batchId)
        .map(async (b) => {
          const jobs = await app.prisma.job.groupBy({
            by: ['status'],
            where: { batchId: b.batchId! },
            _count: true,
          });
          const statusMap = Object.fromEntries(jobs.map((j) => [j.status, j._count]));
          const total = b._count;
          const completed = statusMap.COMPLETED ?? 0;
          return {
            batchId: b.batchId,
            total,
            completed,
            failed: (statusMap.FAILED ?? 0) + (statusMap.DEAD_LETTER ?? 0),
            pending: total - completed - (statusMap.FAILED ?? 0) - (statusMap.DEAD_LETTER ?? 0),
            progressPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
          };
        })
    );

    return successResponse(batchStats);
  });

  // Workflows
  app.get('/projects/:projectId/workflows', async (request) => {
    const { projectId } = request.params as { projectId: string };
    await app.rbac.checkProjectAccess(request.userId!, projectId);
    const workflows = await app.workflowService.list(projectId);
    return successResponse(workflows);
  });

  app.post('/projects/:projectId/workflows', async (request) => {
    const { projectId } = request.params as { projectId: string };
    await app.rbac.checkProjectAccess(request.userId!, projectId, 'DEVELOPER');
    const body = createWorkflowSchema.parse(request.body);
    const workflow = await app.workflowService.create(projectId, body);
    return successResponse(workflow);
  });

  app.get('/projects/:projectId/workflows/:workflowId', async (request) => {
    const { projectId, workflowId } = request.params as { projectId: string; workflowId: string };
    await app.rbac.checkProjectAccess(request.userId!, projectId);
    const workflow = await app.workflowService.getWorkflow(workflowId, projectId);
    return successResponse(workflow);
  });
}
