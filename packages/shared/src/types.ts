export type JobStatus =
  | 'QUEUED'
  | 'SCHEDULED'
  | 'CLAIMED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'RETRY_SCHEDULED'
  | 'DEAD_LETTER'
  | 'CANCELLED';

export type QueueStatus = 'ACTIVE' | 'PAUSED' | 'DRAINING' | 'DISABLED';

export type WorkerStatus =
  | 'STARTING'
  | 'IDLE'
  | 'BUSY'
  | 'DRAINING'
  | 'STOPPED'
  | 'UNHEALTHY';

export type BackoffType = 'FIXED' | 'LINEAR' | 'EXPONENTIAL';

export type ScheduleType =
  | 'immediate'
  | 'delay'
  | 'timestamp'
  | 'cron'
  | 'recurring'
  | 'batch'
  | 'workflow';

export type OrgRole = 'ADMIN' | 'OPERATOR' | 'DEVELOPER' | 'VIEWER';

export type ProjectRole = 'ADMIN' | 'OPERATOR' | 'DEVELOPER' | 'VIEWER';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ScheduleConfig {
  type: ScheduleType;
  delayMs?: number;
  runAt?: string;
  cron?: string;
  intervalMs?: number;
  timezone?: string;
}

export interface RetryPolicyConfig {
  maxAttempts: number;
  backoffType: BackoffType;
  initialDelayMs: number;
  maxDelayMs: number;
  jitter: boolean;
}

export interface JobPayload {
  [key: string]: unknown;
}

export interface WorkerInfo {
  id: string;
  hostname: string;
  processId: number;
  version: string;
  status: WorkerStatus;
  capacity: number;
  currentJobs: number;
}
