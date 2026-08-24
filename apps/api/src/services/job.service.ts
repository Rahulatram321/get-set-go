import type { PrismaClient } from '@orbitqueue/database';
import { NotFoundError, ConflictError } from '@orbitqueue/shared';
import type { CreateJobInput } from '@orbitqueue/validation';
import { calculateNextRun } from '@orbitqueue/queue-core';
import { nanoid } from 'nanoid';

export class JobService {
  constructor(private readonly prisma: PrismaClient) {}

  async createJob(projectId: string, input: CreateJobInput, idempotencyKey?: string) {
    const queue = await this.prisma.queue.findFirst({
      where: { projectId, name: input.queue },
    });
    if (!queue) throw new NotFoundError('Queue', input.queue);

    if (idempotencyKey) {
      const existing = await this.prisma.idempotencyRecord.findUnique({
        where: { queueId_idempotencyKey: { queueId: queue.id, idempotencyKey } },
      });
      if (existing) {
        const job = await this.prisma.job.findUnique({ where: { id: existing.jobId } });
        if (job) return job;
      }
    }

    const schedule = input.schedule;
    let status: 'QUEUED' | 'SCHEDULED' = 'QUEUED';
    let availableAt = new Date();
    let scheduledAt: Date | null = null;
    let scheduleType: 'IMMEDIATE' | 'DELAY' | 'TIMESTAMP' | 'CRON' | 'RECURRING' | 'BATCH' | 'WORKFLOW' = 'IMMEDIATE';

    switch (schedule.type) {
      case 'immediate':
        scheduleType = 'IMMEDIATE';
        break;
      case 'delay':
        scheduleType = 'DELAY';
        availableAt = new Date(Date.now() + schedule.delayMs);
        status = 'SCHEDULED';
        scheduledAt = availableAt;
        break;
      case 'timestamp':
        scheduleType = 'TIMESTAMP';
        availableAt = new Date(schedule.runAt);
        status = 'SCHEDULED';
        scheduledAt = availableAt;
        break;
      case 'cron':
        scheduleType = 'CRON';
        availableAt = calculateNextRun('CRON', { cron: schedule.cron, timezone: schedule.timezone });
        status = 'SCHEDULED';
        scheduledAt = availableAt;
        await this.prisma.scheduledJob.create({
          data: {
            queueId: queue.id,
            name: input.name,
            payload: input.payload as object,
            scheduleType: 'CRON',
            cron: schedule.cron,
            timezone: schedule.timezone ?? 'UTC',
            nextRunAt: availableAt,
            priority: input.priority ?? 10,
          },
        });
        break;
      case 'recurring':
        scheduleType = 'RECURRING';
        availableAt = calculateNextRun('RECURRING', { intervalMs: schedule.intervalMs });
        status = 'SCHEDULED';
        scheduledAt = availableAt;
        await this.prisma.scheduledJob.create({
          data: {
            queueId: queue.id,
            name: input.name,
            payload: input.payload as object,
            scheduleType: 'RECURRING',
            intervalMs: schedule.intervalMs,
            nextRunAt: availableAt,
            priority: input.priority ?? 10,
          },
        });
        break;
      case 'workflow':
        scheduleType = 'WORKFLOW';
        break;
      default:
        scheduleType = 'IMMEDIATE';
    }

    const job = await this.prisma.job.create({
      data: {
        projectId,
        queueId: queue.id,
        name: input.name,
        payload: input.payload as object,
        priority: input.priority ?? queue.priority,
        maxAttempts: input.maxAttempts ?? queue.maxAttempts,
        status,
        scheduleType,
        availableAt,
        scheduledAt,
        idempotencyKey,
        workflowId: schedule.type === 'workflow' ? schedule.workflowId : undefined,
      },
    });

    if (idempotencyKey) {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);
      await this.prisma.idempotencyRecord.create({
        data: { idempotencyKey, queueId: queue.id, jobId: job.id, expiresAt },
      });
    }

    return job;
  }

  async createBatch(projectId: string, queueName: string, jobs: Array<{ name: string; payload: Record<string, unknown>; priority?: number }>) {
    const queue = await this.prisma.queue.findFirst({
      where: { projectId, name: queueName },
    });
    if (!queue) throw new NotFoundError('Queue', queueName);

    const batchId = nanoid();
    const created = await this.prisma.$transaction(
      jobs.map((j) =>
        this.prisma.job.create({
          data: {
            projectId,
            queueId: queue.id,
            name: j.name,
            payload: j.payload as object,
            priority: j.priority ?? queue.priority,
            maxAttempts: queue.maxAttempts,
            batchId,
            scheduleType: 'BATCH',
          },
        })
      )
    );

    return { batchId, total: created.length, jobs: created };
  }

  async retryJob(jobId: string, projectId: string) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, projectId },
    });
    if (!job) throw new NotFoundError('Job', jobId);
    if (!['FAILED', 'DEAD_LETTER', 'RETRY_SCHEDULED'].includes(job.status)) {
      throw new ConflictError('Job cannot be retried in current state');
    }

    if (job.status === 'DEAD_LETTER') {
      await this.prisma.deadLetterJob.deleteMany({ where: { jobId } });
    }

    return this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'QUEUED',
        availableAt: new Date(),
        workerId: null,
        errorMessage: null,
        failedAt: null,
        retryAt: null,
      },
    });
  }

  async cancelJob(jobId: string, projectId: string) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, projectId },
    });
    if (!job) throw new NotFoundError('Job', jobId);

    return this.prisma.job.update({
      where: { id: jobId },
      data: { status: 'CANCELLED' },
    });
  }

  async listJobs(projectId: string, filters: {
    page: number;
    limit: number;
    status?: string;
    queueId?: string;
    workerId?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const where: Record<string, unknown> = { projectId };
    if (filters.status) where.status = filters.status;
    if (filters.queueId) where.queueId = filters.queueId;
    if (filters.workerId) where.workerId = filters.workerId;
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { id: { contains: filters.search } },
        { errorMessage: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const orderBy = filters.sortBy
      ? { [filters.sortBy]: filters.sortOrder ?? 'desc' }
      : { createdAt: 'desc' as const };

    const [jobs, total] = await Promise.all([
      this.prisma.job.findMany({
        where,
        orderBy,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        include: { queue: { select: { name: true } }, worker: { select: { workerId: true, hostname: true } } },
      }),
      this.prisma.job.count({ where }),
    ]);

    return { jobs, total };
  }

  async getJob(jobId: string, projectId: string) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, projectId },
      include: {
        queue: true,
        worker: true,
        executions: { orderBy: { startedAt: 'desc' } },
        logs: { orderBy: { createdAt: 'asc' }, take: 500 },
        deadLetter: true,
      },
    });
    if (!job) throw new NotFoundError('Job', jobId);
    return job;
  }
}
