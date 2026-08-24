import { nanoid } from 'nanoid';
import { loadEnv } from '@orbitqueue/config';
import { prisma } from '@orbitqueue/database';
import { createLogger } from '@orbitqueue/logger';
import { DistributedLock, createRedisClient, calculateNextRun } from '@orbitqueue/queue-core';

export class SchedulerService {
  private readonly logger;
  private readonly lock: DistributedLock;
  private readonly leaderId = `scheduler-${nanoid(8)}`;
  private running = false;
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly env = loadEnv(),
    private readonly redis = createRedisClient(loadEnv().REDIS_URL)
  ) {
    this.logger = createLogger({ name: 'orbitqueue-scheduler' });
    this.lock = new DistributedLock(redis);
  }

  async start() {
    await this.redis.connect();
    this.running = true;
    this.logger.info({ leaderId: this.leaderId }, 'Scheduler started');

    this.interval = setInterval(() => void this.tick(), this.env.SCHEDULER_POLL_INTERVAL_MS);

    process.on('SIGTERM', () => void this.stop());
    process.on('SIGINT', () => void this.stop());
  }

  private async tick() {
    if (!this.running) return;

    const isLeader = await this.lock.acquire(
      'orbitqueue:scheduler:leader',
      this.env.SCHEDULER_LEADER_LOCK_TTL_MS,
      this.leaderId
    );

    if (!isLeader) return;

    try {
      await Promise.all([
        this.processScheduledJobs(),
        this.promoteReadyJobs(),
        this.cleanupIdempotencyRecords(),
      ]);
    } finally {
      await this.lock.release('orbitqueue:scheduler:leader', this.leaderId);
    }
  }

  private async processScheduledJobs() {
    const now = new Date();
    const due = await prisma.scheduledJob.findMany({
      where: { enabled: true, nextRunAt: { lte: now } },
      include: { queue: { include: { project: true } } },
      take: 100,
    });

    for (const scheduled of due) {
      await prisma.$transaction(async (tx) => {
        const current = await tx.scheduledJob.findUnique({ where: { id: scheduled.id } });
        if (!current || !current.enabled || current.nextRunAt > now) return;

        await tx.job.create({
          data: {
            projectId: scheduled.queue.projectId,
            queueId: scheduled.queueId,
            name: scheduled.name,
            payload: scheduled.payload as object,
            priority: scheduled.priority,
            status: 'QUEUED',
            scheduleType: scheduled.scheduleType,
            availableAt: now,
          },
        });

        const nextRunAt = calculateNextRun(scheduled.scheduleType, {
          cron: scheduled.cron ?? undefined,
          intervalMs: scheduled.intervalMs ?? undefined,
          timezone: scheduled.timezone,
          lastRunAt: now,
        });

        await tx.scheduledJob.update({
          where: { id: scheduled.id },
          data: { lastRunAt: now, nextRunAt },
        });
      });
    }
  }

  private async promoteReadyJobs() {
    const now = new Date();
    const result = await prisma.job.updateMany({
      where: {
        status: 'SCHEDULED',
        availableAt: { lte: now },
      },
      data: { status: 'QUEUED' },
    });

    const retryResult = await prisma.job.updateMany({
      where: {
        status: 'RETRY_SCHEDULED',
        availableAt: { lte: now },
      },
      data: { status: 'QUEUED' },
    });

    if (result.count + retryResult.count > 0) {
      this.logger.debug({ promoted: result.count + retryResult.count }, 'Promoted scheduled jobs');
    }
  }

  private async cleanupIdempotencyRecords() {
    await prisma.idempotencyRecord.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
  }

  async stop() {
    this.running = false;
    if (this.interval) clearInterval(this.interval);
    await this.redis.quit();
    await prisma.$disconnect();
    this.logger.info('Scheduler stopped');
    process.exit(0);
  }
}
