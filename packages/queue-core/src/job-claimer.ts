import type { PrismaClient, Job, Queue, RateLimit } from '@orbitqueue/database';

export type QueueWithRateLimit = Queue & { rateLimit: RateLimit | null };

export interface ClaimedJob {
  job: Job;
  queue: QueueWithRateLimit;
}

export interface JobClaimerOptions {
  workerId: string;
  queueIds: string[];
  limit?: number;
  leaseDurationMs: number;
}

export class JobClaimer {
  constructor(private readonly prisma: PrismaClient) {}

  async claimJobs(options: JobClaimerOptions): Promise<ClaimedJob[]> {
    const { workerId, queueIds, limit = 1, leaseDurationMs } = options;

    if (queueIds.length === 0) return [];

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);

      const claimableStatuses = ['QUEUED', 'RETRY_SCHEDULED'] as const;

      const jobs = await tx.$queryRaw<
        Array<{ id: string; queue_id: string }>
      >`
        SELECT j.id, j.queue_id
        FROM jobs j
        INNER JOIN queues q ON q.id = j.queue_id
        WHERE j.queue_id = ANY(${queueIds}::text[])
          AND j.status::text = ANY(${claimableStatuses}::text[])
          AND j.available_at <= ${now}
          AND q.status = 'ACTIVE'
        ORDER BY j.priority ASC, j.available_at ASC, j.created_at ASC
        FOR UPDATE OF j SKIP LOCKED
        LIMIT ${limit}
      `;

      if (jobs.length === 0) return [];

      const claimed: ClaimedJob[] = [];

      for (const row of jobs) {
        const job = await tx.job.update({
          where: { id: row.id },
          data: {
            status: 'CLAIMED',
            workerId,
            claimedAt: now,
            leaseExpiresAt,
            attemptNumber: { increment: 1 },
          },
        });

        const queue = await tx.queue.findUniqueOrThrow({
          where: { id: row.queue_id },
          include: { rateLimit: true },
        });

        claimed.push({ job, queue });
      }

      return claimed;
    });
  }

  async extendLease(jobId: string, workerId: string, leaseDurationMs: number): Promise<boolean> {
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);

    const result = await this.prisma.job.updateMany({
      where: {
        id: jobId,
        workerId,
        status: { in: ['CLAIMED', 'RUNNING'] },
      },
      data: { leaseExpiresAt },
    });

    return result.count > 0;
  }

  async recoverExpiredLeases(): Promise<number> {
    const now = new Date();

    const expiredJobs = await this.prisma.job.findMany({
      where: {
        status: { in: ['CLAIMED', 'RUNNING'] },
        leaseExpiresAt: { lt: now },
      },
      select: { id: true, attemptNumber: true, maxAttempts: true },
    });

    let recovered = 0;

    for (const job of expiredJobs) {
      await this.prisma.$transaction(async (tx) => {
        const current = await tx.job.findUnique({ where: { id: job.id } });
        if (!current || !['CLAIMED', 'RUNNING'].includes(current.status)) return;
        if (current.leaseExpiresAt && current.leaseExpiresAt >= now) return;

        if (current.attemptNumber >= current.maxAttempts) {
          await tx.job.update({
            where: { id: job.id },
            data: {
              status: 'DEAD_LETTER',
              failedAt: now,
              workerId: null,
              errorMessage: 'Lease expired - max attempts reached',
            },
          });
          await tx.deadLetterJob.create({
            data: {
              jobId: job.id,
              queueId: current.queueId,
              name: current.name,
              payload: current.payload as object,
              failureReason: 'Lease expired',
              attemptCount: current.attemptNumber,
              lastError: 'Worker lost lease without completing job',
            },
          });
        } else {
          await tx.job.update({
            where: { id: job.id },
            data: {
              status: 'RETRY_SCHEDULED',
              workerId: null,
              retryAt: now,
              availableAt: now,
              errorMessage: 'Lease expired - job recovered',
            },
          });
        }
        recovered++;
      });
    }

    return recovered;
  }
}
