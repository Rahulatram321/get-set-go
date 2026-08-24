import os from 'os';
import { nanoid } from 'nanoid';
import { loadEnv } from '@orbitqueue/config';
import { prisma } from '@orbitqueue/database';
import { createLogger } from '@orbitqueue/logger';
import {
  JobClaimer,
  JobLifecycleService,
  ConcurrencyManager,
  ExecutionPool,
  createRedisClient,
  RateLimiter,
  WorkflowRunner,
} from '@orbitqueue/queue-core';
import { globalMetrics } from '@orbitqueue/metrics';
import { executeJobHandler } from './handlers/index.js';

export class WorkerService {
  private readonly workerId: string;
  private readonly logger;
  private readonly claimer: JobClaimer;
  private readonly lifecycle: JobLifecycleService;
  private readonly concurrency: ConcurrencyManager;
  private readonly pool: ExecutionPool;
  private readonly rateLimiter: RateLimiter;
  private readonly workflowRunner: WorkflowRunner;
  private dbWorkerId: string | null = null;
  private running = false;
  private draining = false;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private recoveryInterval: ReturnType<typeof setInterval> | null = null;
  private activeJobs = new Map<string, AbortController>();

  constructor(
    private readonly env = loadEnv(),
    private readonly redis = createRedisClient(loadEnv().REDIS_URL)
  ) {
    this.workerId = `worker-${nanoid(8)}`;
    this.logger = createLogger({ name: 'orbitqueue-worker' });
    this.claimer = new JobClaimer(prisma);
    this.lifecycle = new JobLifecycleService(prisma);
    this.concurrency = new ConcurrencyManager(env.WORKER_CONCURRENCY);
    this.pool = new ExecutionPool(env.WORKER_CONCURRENCY);
    this.rateLimiter = new RateLimiter(redis);
    this.workflowRunner = new WorkflowRunner(prisma);
  }

  async start(): Promise<void> {
    await this.redis.connect();
    this.running = true;

    const worker = await prisma.worker.create({
      data: {
        workerId: this.workerId,
        hostname: os.hostname(),
        processId: process.pid,
        version: '1.0.0',
        status: 'STARTING',
        capacity: this.env.WORKER_CONCURRENCY,
      },
    });
    this.dbWorkerId = worker.id;

    await this.updateStatus('IDLE');
    this.logger.info({ workerId: this.workerId }, 'Worker started');

    await this.refreshQueueLimits();

    this.pollInterval = setInterval(() => void this.poll(), 1000);
    this.heartbeatInterval = setInterval(() => void this.sendHeartbeat(), this.env.WORKER_HEARTBEAT_INTERVAL_MS);
    this.recoveryInterval = setInterval(() => void this.recoverLeases(), 30000);

    this.setupGracefulShutdown();
  }

  private async refreshQueueLimits() {
    const queues = await prisma.queue.findMany({
      where: { status: 'ACTIVE' },
      include: { rateLimit: true },
    });
    for (const q of queues) {
      this.concurrency.updateQueueLimit(q.id, q.concurrencyLimit);
    }
  }

  private async poll() {
    if (!this.running || this.draining) return;
    if (this.concurrency.activeCount >= this.env.WORKER_CONCURRENCY) return;

    await this.refreshQueueLimits();

    const activeQueues = await prisma.queue.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, rateLimit: true },
    });

    const eligibleQueueIds = activeQueues
      .filter((q) => this.concurrency.canAccept(q.id))
      .map((q) => q.id);

    if (eligibleQueueIds.length === 0) return;

    const limit = this.env.WORKER_CONCURRENCY - this.concurrency.activeCount;
    const claimed = await this.claimer.claimJobs({
      workerId: this.dbWorkerId!,
      queueIds: eligibleQueueIds,
      limit,
      leaseDurationMs: this.env.WORKER_LEASE_DURATION_MS,
    });

    for (const { job, queue } of claimed) {
      if (queue.rateLimit) {
        const allowed = await this.rateLimiter.checkLimit(
          `queue:${queue.id}`,
          queue.rateLimit.limit,
          queue.rateLimit.windowMs
        );
        if (!allowed) {
          await prisma.job.update({
            where: { id: job.id },
            data: {
              status: 'QUEUED',
              workerId: null,
              availableAt: new Date(Date.now() + 1000),
            },
          });
          continue;
        }
      }

      if (!this.concurrency.acquire(queue.id)) continue;

      void this.pool.run(() => this.executeJob(job.id, queue.id));
    }
  }

  private async executeJob(jobId: string, queueId: string) {
    const abortController = new AbortController();
    this.activeJobs.set(jobId, abortController);
    const startTime = Date.now();

    try {
      await this.updateStatus('BUSY');
      await this.lifecycle.markRunning(jobId, this.dbWorkerId!);

      const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });

      await prisma.jobLog.create({
        data: { jobId, level: 'info', message: `Execution started on ${this.workerId}` },
      });

      const leaseInterval = setInterval(() => {
        void this.claimer.extendLease(jobId, this.dbWorkerId!, this.env.WORKER_LEASE_DURATION_MS);
      }, this.env.WORKER_HEARTBEAT_INTERVAL_MS);

      let result: { success: boolean; error?: string; stackTrace?: string; stdout?: string; stderr?: string };

      try {
        result = await executeJobHandler(job.name, job.payload as Record<string, unknown>);
      } catch (err) {
        result = {
          success: false,
          error: err instanceof Error ? err.message : String(err),
          stackTrace: err instanceof Error ? err.stack : undefined,
        };
      } finally {
        clearInterval(leaseInterval);
      }

      const durationMs = Date.now() - startTime;

      await this.lifecycle.completeJob({
        jobId,
        workerId: this.dbWorkerId!,
        success: result.success,
        error: result.error,
        stackTrace: result.stackTrace,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs,
      });

      await prisma.jobLog.create({
        data: {
          jobId,
          level: result.success ? 'info' : 'error',
          message: result.success ? 'Execution completed' : `Execution failed: ${result.error}`,
        },
      });

      if (result.success) {
        globalMetrics.increment('jobs_completed_total');
        globalMetrics.observe('job_duration_ms', durationMs);
        if (job.workflowId) {
          await this.workflowRunner.onJobCompleted(jobId);
        }
      } else {
        globalMetrics.increment('jobs_failed_total');
        if (job.workflowId) {
          await this.workflowRunner.onJobFailed(jobId);
        }
      }

      await this.recordQueueMetric(queueId, result.success, durationMs);
    } finally {
      this.activeJobs.delete(jobId);
      this.concurrency.release(queueId);
      await this.updateCurrentJobs();
      if (this.concurrency.activeCount === 0 && !this.draining) {
        await this.updateStatus('IDLE');
      }
    }
  }

  private async recordQueueMetric(queueId: string, success: boolean, durationMs: number) {
    const depth = await prisma.job.count({
      where: { queueId, status: { in: ['QUEUED', 'SCHEDULED', 'RETRY_SCHEDULED'] } },
    });

    await prisma.queueMetric.create({
      data: {
        queueId,
        jobsProcessed: success ? 1 : 0,
        jobsFailed: success ? 0 : 1,
        avgLatencyMs: durationMs,
        queueDepth: depth,
        throughputPerMin: 1,
      },
    });
  }

  private async sendHeartbeat() {
    if (!this.dbWorkerId) return;

    const mem = process.memoryUsage();
    const status = this.draining ? 'DRAINING' : this.concurrency.activeCount > 0 ? 'BUSY' : 'IDLE';

    await prisma.worker.update({
      where: { id: this.dbWorkerId },
      data: {
        lastHeartbeat: new Date(),
        currentJobs: this.concurrency.activeCount,
        status,
      },
    });

    await prisma.workerHeartbeat.create({
      data: {
        workerId: this.dbWorkerId,
        activeJobs: this.concurrency.activeCount,
        capacity: this.env.WORKER_CONCURRENCY,
        memoryUsage: mem.heapUsed / 1024 / 1024,
        cpuUsage: 0,
        status,
      },
    });

    globalMetrics.gauge('worker_active_jobs', this.concurrency.activeCount, { worker: this.workerId });
  }

  private async recoverLeases() {
    const recovered = await this.claimer.recoverExpiredLeases();
    if (recovered > 0) {
      this.logger.warn({ recovered }, 'Recovered expired job leases');
    }

    const threshold = new Date(Date.now() - 30000);
    await prisma.worker.updateMany({
      where: {
        lastHeartbeat: { lt: threshold },
        status: { notIn: ['STOPPED', 'DRAINING'] },
      },
      data: { status: 'UNHEALTHY' },
    });
  }

  private async updateStatus(status: 'IDLE' | 'BUSY' | 'DRAINING' | 'STOPPED' | 'STARTING') {
    if (!this.dbWorkerId) return;
    await prisma.worker.update({
      where: { id: this.dbWorkerId },
      data: { status, currentJobs: this.concurrency.activeCount },
    });
  }

  private async updateCurrentJobs() {
    if (!this.dbWorkerId) return;
    await prisma.worker.update({
      where: { id: this.dbWorkerId },
      data: { currentJobs: this.concurrency.activeCount },
    });
  }

  private setupGracefulShutdown() {
    const shutdown = async (signal: string) => {
      this.logger.info({ signal }, 'Graceful shutdown initiated');
      this.draining = true;
      this.running = false;

      if (this.pollInterval) clearInterval(this.pollInterval);
      if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
      if (this.recoveryInterval) clearInterval(this.recoveryInterval);

      await this.updateStatus('DRAINING');

      const timeout = setTimeout(() => {
        this.logger.warn('Shutdown timeout exceeded, forcing exit');
        process.exit(1);
      }, this.env.WORKER_SHUTDOWN_TIMEOUT_MS);

      while (this.activeJobs.size > 0) {
        await new Promise((r) => setTimeout(r, 500));
      }

      clearTimeout(timeout);
      await this.updateStatus('STOPPED');
      await prisma.worker.update({
        where: { id: this.dbWorkerId! },
        data: { stoppedAt: new Date() },
      });

      await this.redis.quit();
      await prisma.$disconnect();
      this.logger.info('Worker stopped gracefully');
      process.exit(0);
    };

    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));
  }
}
