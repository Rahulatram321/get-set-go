/**
 * Concurrency test: proves atomic job claiming prevents duplicate execution.
 *
 * Run with: pnpm test (requires PostgreSQL)
 *
 * Simulates 10 workers claiming 100 jobs from the same queue.
 * Verifies each job is claimed exactly once.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { JobClaimer } from '@orbitqueue/queue-core';

const prisma = new PrismaClient();
const claimer = new JobClaimer(prisma);

describe('Atomic Job Claiming Concurrency', () => {
  let projectId: string;
  let queueId: string;
  const workerIds: string[] = [];

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: {
        name: 'Concurrency Test Org',
        slug: `concurrency-test-${Date.now()}`,
      },
    });

    const project = await prisma.project.create({
      data: {
        organizationId: org.id,
        name: 'Concurrency Test',
        slug: 'concurrency-test',
      },
    });
    projectId = project.id;

    const queue = await prisma.queue.create({
      data: {
        projectId,
        name: 'concurrency-queue',
        concurrencyLimit: 100,
      },
    });
    queueId = queue.id;

    for (let i = 0; i < 100; i++) {
      await prisma.job.create({
        data: {
          projectId,
          queueId,
          name: `concurrency-job-${i}`,
          payload: { index: i },
          status: 'QUEUED',
        },
      });
    }

    for (let i = 0; i < 10; i++) {
      const worker = await prisma.worker.create({
        data: {
          workerId: `test-worker-${i}`,
          hostname: 'test',
          processId: 1000 + i,
          status: 'IDLE',
        },
      });
      workerIds.push(worker.id);
    }
  });

  afterAll(async () => {
    await prisma.job.deleteMany({ where: { projectId } });
    await prisma.queue.deleteMany({ where: { projectId } });
    await prisma.worker.deleteMany({ where: { id: { in: workerIds } } });
    await prisma.project.delete({ where: { id: projectId } });
    await prisma.$disconnect();
  });

  it('10 workers claiming 100 jobs - no duplicate claims', async () => {
    const claimedJobIds: string[] = [];

    const claimPromises = workerIds.map(async (workerId) => {
      const localClaims: string[] = [];
      for (let attempt = 0; attempt < 20; attempt++) {
        const claimed = await claimer.claimJobs({
          workerId,
          queueIds: [queueId],
          limit: 5,
          leaseDurationMs: 60000,
        });
        for (const { job } of claimed) {
          localClaims.push(job.id);
        }
        if (claimed.length === 0) break;
      }
      return localClaims;
    });

    const results = await Promise.all(claimPromises);
    for (const claims of results) {
      claimedJobIds.push(...claims);
    }

    const uniqueIds = new Set(claimedJobIds);
    expect(claimedJobIds.length).toBe(uniqueIds.size);
    expect(uniqueIds.size).toBe(100);
  });
});
