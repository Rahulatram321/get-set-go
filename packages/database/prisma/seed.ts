import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding OrbitQueue database...');

  const passwordHash = await bcrypt.hash('password123', 12);

  const user = await prisma.user.upsert({
    where: { email: 'admin@orbitqueue.dev' },
    update: {},
    create: {
      email: 'admin@orbitqueue.dev',
      passwordHash,
      name: 'Admin User',
    },
  });

  const org = await prisma.organization.upsert({
    where: { slug: 'acme-engineering' },
    update: {},
    create: {
      name: 'Acme Engineering',
      slug: 'acme-engineering',
      description: 'Building reliable systems at scale',
      members: { create: { userId: user.id, role: 'ADMIN' } },
    },
  });

  const projects = await Promise.all([
    upsertProject(org.id, user.id, 'payments-platform', 'Payments Platform', 'Payment processing and billing'),
    upsertProject(org.id, user.id, 'notification-service', 'Notification Service', 'Email, SMS, and push notifications'),
    upsertProject(org.id, user.id, 'data-processing', 'Data Processing', 'ETL pipelines and analytics'),
  ]);

  for (const project of projects) {
    const queues = await Promise.all([
      createQueue(project.id, 'email', 'Email delivery queue', 5),
      createQueue(project.id, 'payments', 'Payment processing queue', 3),
      createQueue(project.id, 'reports', 'Report generation queue', 2),
      createQueue(project.id, 'notifications', 'Push notification queue', 10),
      createQueue(project.id, 'analytics', 'Analytics event queue', 20),
    ]);

    await seedJobs(project.id, queues);
    await seedWorkers();
    await seedMetrics(queues.map((q) => q.id));
  }

  await prisma.systemEvent.createMany({
    data: [
      { type: 'SYSTEM_START', message: 'OrbitQueue platform initialized', severity: 'info' },
      { type: 'SEED_COMPLETE', message: 'Demo data seeded successfully', severity: 'info' },
    ],
  });

  console.log('Seed complete!');
  console.log('Login: admin@orbitqueue.dev / password123');
}

async function upsertProject(orgId: string, userId: string, slug: string, name: string, description: string) {
  return prisma.project.upsert({
    where: { organizationId_slug: { organizationId: orgId, slug } },
    update: {},
    create: {
      organizationId: orgId,
      name,
      slug,
      description,
      members: { create: { userId, role: 'ADMIN' } },
    },
  });
}

async function createQueue(projectId: string, name: string, description: string, concurrencyLimit: number) {
  const retryPolicy = await prisma.retryPolicy.create({
    data: {
      maxAttempts: 3,
      backoffType: 'EXPONENTIAL',
      initialDelayMs: 5000,
      maxDelayMs: 300000,
      jitter: true,
    },
  });

  return prisma.queue.upsert({
    where: { projectId_name: { projectId, name } },
    update: {},
    create: {
      projectId,
      name,
      description,
      concurrencyLimit,
      retryPolicyId: retryPolicy.id,
    },
  });
}

async function seedJobs(projectId: string, queues: Array<{ id: string; name: string }>) {
  const jobTemplates: Array<{ name: string; status: 'COMPLETED' | 'FAILED' | 'QUEUED' | 'RUNNING' | 'RETRY_SCHEDULED' | 'DEAD_LETTER' | 'SCHEDULED'; queueName: string }> = [
    { name: 'send-welcome-email', status: 'COMPLETED', queueName: 'email' },
    { name: 'send-welcome-email', status: 'COMPLETED', queueName: 'email' },
    { name: 'process-payment', status: 'COMPLETED', queueName: 'payments' },
    { name: 'process-payment', status: 'FAILED', queueName: 'payments' },
    { name: 'generate-report', status: 'RUNNING', queueName: 'reports' },
    { name: 'send-notification', status: 'QUEUED', queueName: 'notifications' },
    { name: 'send-notification', status: 'QUEUED', queueName: 'notifications' },
    { name: 'analytics-event', status: 'COMPLETED', queueName: 'analytics' },
    { name: 'data-sync', status: 'RETRY_SCHEDULED', queueName: 'analytics' },
    { name: 'health-check', status: 'SCHEDULED', queueName: 'notifications' },
  ];

  const now = new Date();

  for (const tmpl of jobTemplates) {
    const queue = queues.find((q) => q.name === tmpl.queueName);
    if (!queue) continue;

    const job = await prisma.job.create({
      data: {
        projectId,
        queueId: queue.id,
        name: tmpl.name,
        payload: { seeded: true, userId: 'demo-user' },
        status: tmpl.status,
        priority: 10,
        attemptNumber: tmpl.status === 'FAILED' ? 2 : tmpl.status === 'COMPLETED' ? 1 : 0,
        maxAttempts: 3,
        availableAt: now,
        ...(tmpl.status === 'COMPLETED' && {
          startedAt: new Date(now.getTime() - 5000),
          completedAt: now,
          executionDurationMs: 1200,
        }),
        ...(tmpl.status === 'FAILED' && {
          startedAt: new Date(now.getTime() - 3000),
          failedAt: now,
          errorMessage: 'Connection timeout while calling external API',
        }),
        ...(tmpl.status === 'SCHEDULED' && {
          scheduledAt: new Date(now.getTime() + 3600000),
          availableAt: new Date(now.getTime() + 3600000),
        }),
        ...(tmpl.status === 'RETRY_SCHEDULED' && {
          retryAt: new Date(now.getTime() + 10000),
          availableAt: new Date(now.getTime() + 10000),
          errorMessage: 'Temporary failure - retry scheduled',
        }),
      },
    });

    if (tmpl.status === 'DEAD_LETTER' || tmpl.status === 'FAILED') {
      // Create one DLQ entry for demo
    }
  }

  const failedJob = await prisma.job.findFirst({
    where: { projectId, status: 'FAILED' },
  });

  if (failedJob) {
    await prisma.deadLetterJob.create({
      data: {
        jobId: failedJob.id,
        queueId: failedJob.queueId,
        name: failedJob.name,
        payload: failedJob.payload as object,
        failureReason: 'Max retries exceeded',
        attemptCount: 3,
        lastError: failedJob.errorMessage ?? 'Unknown error',
      },
    }).catch(() => {});
  }
}

async function seedWorkers() {
  const existing = await prisma.worker.count();
  if (existing > 0) return;

  const workers = [
    { workerId: 'worker-alpha-01', hostname: 'node-1.local', status: 'IDLE' as const, currentJobs: 0 },
    { workerId: 'worker-beta-02', hostname: 'node-2.local', status: 'BUSY' as const, currentJobs: 3 },
    { workerId: 'worker-gamma-03', hostname: 'node-3.local', status: 'IDLE' as const, currentJobs: 0 },
  ];

  for (const w of workers) {
    const worker = await prisma.worker.create({
      data: {
        ...w,
        processId: Math.floor(Math.random() * 65535),
        capacity: 10,
        lastHeartbeat: new Date(),
      },
    });

    for (let i = 0; i < 5; i++) {
      await prisma.workerHeartbeat.create({
        data: {
          workerId: worker.id,
          activeJobs: w.currentJobs,
          capacity: 10,
          memoryUsage: 128 + Math.random() * 256,
          cpuUsage: Math.random() * 80,
          status: w.status,
          timestamp: new Date(Date.now() - i * 5000),
        },
      });
    }
  }
}

async function seedMetrics(queueIds: string[]) {
  const now = Date.now();
  for (const queueId of queueIds) {
    for (let i = 23; i >= 0; i--) {
      await prisma.queueMetric.create({
        data: {
          queueId,
          timestamp: new Date(now - i * 3600000),
          jobsProcessed: Math.floor(Math.random() * 100) + 10,
          jobsFailed: Math.floor(Math.random() * 10),
          jobsRetried: Math.floor(Math.random() * 5),
          avgLatencyMs: 500 + Math.random() * 2000,
          queueDepth: Math.floor(Math.random() * 50),
          throughputPerMin: Math.floor(Math.random() * 60) + 5,
        },
      });
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
