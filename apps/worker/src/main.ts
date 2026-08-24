import { WorkerService } from './worker.service.js';

async function main() {
  const worker = new WorkerService();
  await worker.start();
}

main().catch((err) => {
  console.error('Worker failed to start:', err);
  process.exit(1);
});
