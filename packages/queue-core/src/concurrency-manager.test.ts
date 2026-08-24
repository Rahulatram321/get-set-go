import { describe, it, expect } from 'vitest';
import { ConcurrencyManager, ExecutionPool } from '../src/concurrency-manager.js';

describe('ConcurrencyManager', () => {
  it('respects worker concurrency limit', () => {
    const manager = new ConcurrencyManager(3);
    expect(manager.acquire('q1')).toBe(true);
    expect(manager.acquire('q1')).toBe(true);
    expect(manager.acquire('q1')).toBe(true);
    expect(manager.acquire('q1')).toBe(false);
    manager.release('q1');
    expect(manager.acquire('q1')).toBe(true);
  });

  it('respects queue concurrency limit', () => {
    const manager = new ConcurrencyManager(10, new Map([['q1', 2]]));
    expect(manager.acquire('q1')).toBe(true);
    expect(manager.acquire('q1')).toBe(true);
    expect(manager.acquire('q1')).toBe(false);
    expect(manager.acquire('q2')).toBe(true);
  });
});

describe('ExecutionPool', () => {
  it('limits concurrent executions', async () => {
    const pool = new ExecutionPool(2);
    let concurrent = 0;
    let maxConcurrent = 0;

    const task = async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 50));
      concurrent--;
    };

    await Promise.all([
      pool.run(task),
      pool.run(task),
      pool.run(task),
      pool.run(task),
    ]);

    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });
});
