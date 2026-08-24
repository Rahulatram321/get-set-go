export class ConcurrencyManager {
  private readonly queueActiveCounts = new Map<string, number>();
  private globalActive = 0;

  constructor(
    private readonly workerConcurrency: number,
    private readonly queueLimits: Map<string, number> = new Map()
  ) {}

  canAccept(queueId: string): boolean {
    if (this.globalActive >= this.workerConcurrency) return false;
    const queueLimit = this.queueLimits.get(queueId) ?? Infinity;
    const queueActive = this.queueActiveCounts.get(queueId) ?? 0;
    return queueActive < queueLimit;
  }

  acquire(queueId: string): boolean {
    if (!this.canAccept(queueId)) return false;
    this.globalActive++;
    this.queueActiveCounts.set(queueId, (this.queueActiveCounts.get(queueId) ?? 0) + 1);
    return true;
  }

  release(queueId: string): void {
    this.globalActive = Math.max(0, this.globalActive - 1);
    const current = this.queueActiveCounts.get(queueId) ?? 0;
    if (current <= 1) {
      this.queueActiveCounts.delete(queueId);
    } else {
      this.queueActiveCounts.set(queueId, current - 1);
    }
  }

  get activeCount(): number {
    return this.globalActive;
  }

  getQueueActiveCount(queueId: string): number {
    return this.queueActiveCounts.get(queueId) ?? 0;
  }

  updateQueueLimit(queueId: string, limit: number): void {
    this.queueLimits.set(queueId, limit);
  }
}

export class ExecutionPool {
  private running = 0;
  private readonly queue: Array<() => Promise<void>> = [];

  constructor(private readonly maxConcurrency: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    while (this.running >= this.maxConcurrency) {
      await new Promise<void>((resolve) => {
        this.queue.push(async () => resolve());
      });
    }

    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      const next = this.queue.shift();
      if (next) void next();
    }
  }
}
