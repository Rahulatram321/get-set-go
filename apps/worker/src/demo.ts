import { prisma } from '@orbitqueue/database';
import { nanoid } from 'nanoid';

const JOB_NAMES = [
  'send-welcome-email',
  'process-payment',
  'generate-report',
  'send-notification',
  'analytics-event',
  'data-sync',
  'health-check',
];

async function demo() {
  console.log('OrbitQueue demo mode - generating activity...');

  const projects = await prisma.project.findMany({ include: { queues: true } });
  if (projects.length === 0) {
    console.log('No projects found. Run pnpm db:seed first.');
    return;
  }

  const interval = setInterval(async () => {
    for (const project of projects) {
      for (const queue of project.queues) {
        if (queue.status !== 'ACTIVE') continue;
        const count = Math.floor(Math.random() * 3) + 1;
        for (let i = 0; i < count; i++) {
          const name = JOB_NAMES[Math.floor(Math.random() * JOB_NAMES.length)]!;
          await prisma.job.create({
            data: {
              projectId: project.id,
              queueId: queue.id,
              name,
              payload: {
                demo: true,
                timestamp: new Date().toISOString(),
                forceFail: Math.random() < 0.08,
              },
              priority: [1, 5, 10, 20][Math.floor(Math.random() * 4)]!,
              maxAttempts: 3,
            },
          });
        }
      }
    }

    await prisma.systemEvent.create({
      data: {
        type: 'DEMO_TICK',
        message: 'Demo mode generated new jobs',
        severity: 'info',
      },
    });
  }, 5000);

  process.on('SIGINT', () => {
    clearInterval(interval);
    process.exit(0);
  });

  console.log('Demo running. Press Ctrl+C to stop.');
}

demo().catch(console.error);
