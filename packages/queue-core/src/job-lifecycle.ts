import type { PrismaClient } from '@orbitqueue/database';
import { calculateRetryDelay, shouldRetry } from './retry-engine.js';
import type { BackoffType } from '@orbitqueue/shared';

export interface CompleteJobInput {
  jobId: string;
  workerId: string;
  success: boolean;
  error?: string;
  stackTrace?: string;
  stdout?: string;
  stderr?: string;
  durationMs: number;
}

export class JobLifecycleService {
  constructor(private readonly prisma: PrismaClient) {}

  async markRunning(jobId: string, workerId: string): Promise<void> {
    await this.prisma.job.update({
      where: { id: jobId, workerId },
      data: {
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });
  }

  async completeJob(input: CompleteJobInput): Promise<void> {
    const { jobId, workerId, success, error, stackTrace, stdout, stderr, durationMs } = input;
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const job = await tx.job.findUniqueOrThrow({
        where: { id: jobId },
        include: { queue: { include: { retryPolicy: true } } },
      });

      await tx.jobExecution.create({
        data: {
          jobId,
          workerId,
          attemptNumber: job.attemptNumber,
          status: success ? 'COMPLETED' : 'FAILED',
          startedAt: job.startedAt ?? job.claimedAt ?? now,
          completedAt: now,
          durationMs,
          errorMessage: error,
          stackTrace,
          stdout,
          stderr,
        },
      });

      if (success) {
        await tx.job.update({
          where: { id: jobId },
          data: {
            status: 'COMPLETED',
            completedAt: now,
            executionDurationMs: durationMs,
            workerId,
          },
        });
        return;
      }

      const policy = job.queue.retryPolicy;
      const backoffType = (policy?.backoffType ?? 'EXPONENTIAL') as BackoffType;
      const maxAttempts = job.maxAttempts;

      if (shouldRetry(job.attemptNumber, maxAttempts)) {
        const delay = calculateRetryDelay(job.attemptNumber, {
          backoffType,
          initialDelayMs: policy?.initialDelayMs ?? 5000,
          maxDelayMs: policy?.maxDelayMs ?? 300000,
          jitter: policy?.jitter ?? true,
        });

        const retryAt = new Date(now.getTime() + delay);

        await tx.job.update({
          where: { id: jobId },
          data: {
            status: 'RETRY_SCHEDULED',
            failedAt: now,
            retryAt,
            availableAt: retryAt,
            errorMessage: error,
            workerId: null,
            executionDurationMs: durationMs,
          },
        });
      } else {
        await tx.job.update({
          where: { id: jobId },
          data: {
            status: 'DEAD_LETTER',
            failedAt: now,
            errorMessage: error,
            workerId,
            executionDurationMs: durationMs,
          },
        });

        await tx.deadLetterJob.create({
          data: {
            jobId,
            queueId: job.queueId,
            name: job.name,
            payload: job.payload as object,
            failureReason: error ?? 'Job failed',
            attemptCount: job.attemptNumber,
            lastError: error,
            workerId,
          },
        });
      }
    });
  }
}

export class WorkflowEngine {
  constructor(private readonly prisma: PrismaClient) {}

  async onNodeComplete(workflowId: string, nodeId: string): Promise<string[]> {
    const readyNodes: string[] = [];

    const dependents = await this.prisma.workflowDependency.findMany({
      where: { dependsOnNodeId: nodeId },
      include: { node: { include: { dependencies: true } } },
    });

    for (const dep of dependents) {
      const allDepsComplete = await this.areAllDependenciesComplete(dep.nodeId);
      if (allDepsComplete) {
        await this.prisma.workflowNode.update({
          where: { id: dep.nodeId },
          data: { status: 'READY' },
        });
        readyNodes.push(dep.nodeId);
      }
    }

    return readyNodes;
  }

  private async areAllDependenciesComplete(nodeId: string): Promise<boolean> {
    const deps = await this.prisma.workflowDependency.findMany({
      where: { nodeId },
      include: { dependsOnNode: true },
    });

    return deps.every((d) => d.dependsOnNode.status === 'COMPLETED');
  }
}
