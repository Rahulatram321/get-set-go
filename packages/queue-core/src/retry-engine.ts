import type { BackoffType } from '@orbitqueue/shared';

export interface RetryPolicyInput {
  backoffType: BackoffType;
  initialDelayMs: number;
  maxDelayMs: number;
  jitter: boolean;
}

export function calculateRetryDelay(
  attemptNumber: number,
  policy: RetryPolicyInput
): number {
  const { backoffType, initialDelayMs, maxDelayMs, jitter } = policy;
  let delay: number;

  switch (backoffType) {
    case 'FIXED':
      delay = initialDelayMs;
      break;
    case 'LINEAR':
      delay = initialDelayMs * attemptNumber;
      break;
    case 'EXPONENTIAL':
      delay = initialDelayMs * Math.pow(2, attemptNumber - 1);
      break;
    default:
      delay = initialDelayMs;
  }

  delay = Math.min(delay, maxDelayMs);

  if (jitter) {
    const jitterAmount = delay * 0.25;
    delay = delay - jitterAmount + Math.random() * jitterAmount * 2;
  }

  return Math.floor(delay);
}

export function shouldRetry(attemptNumber: number, maxAttempts: number): boolean {
  return attemptNumber < maxAttempts;
}
