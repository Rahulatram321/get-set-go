import { describe, it, expect } from 'vitest';
import { calculateRetryDelay, shouldRetry } from '../src/retry-engine.js';

describe('RetryEngine', () => {
  it('calculates fixed delay', () => {
    const delay = calculateRetryDelay(1, {
      backoffType: 'FIXED',
      initialDelayMs: 5000,
      maxDelayMs: 300000,
      jitter: false,
    });
    expect(delay).toBe(5000);
  });

  it('calculates linear backoff', () => {
    const delay = calculateRetryDelay(3, {
      backoffType: 'LINEAR',
      initialDelayMs: 5000,
      maxDelayMs: 300000,
      jitter: false,
    });
    expect(delay).toBe(15000);
  });

  it('calculates exponential backoff', () => {
    const delay = calculateRetryDelay(3, {
      backoffType: 'EXPONENTIAL',
      initialDelayMs: 5000,
      maxDelayMs: 300000,
      jitter: false,
    });
    expect(delay).toBe(20000);
  });

  it('respects max delay', () => {
    const delay = calculateRetryDelay(10, {
      backoffType: 'EXPONENTIAL',
      initialDelayMs: 5000,
      maxDelayMs: 10000,
      jitter: false,
    });
    expect(delay).toBe(10000);
  });

  it('determines retry eligibility', () => {
    expect(shouldRetry(1, 3)).toBe(true);
    expect(shouldRetry(3, 3)).toBe(false);
  });
});
