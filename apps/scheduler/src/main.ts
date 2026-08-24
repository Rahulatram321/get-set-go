import { SchedulerService } from './scheduler.service.js';

async function main() {
  const scheduler = new SchedulerService();
  await scheduler.start();
}

main().catch((err) => {
  console.error('Scheduler failed to start:', err);
  process.exit(1);
});
