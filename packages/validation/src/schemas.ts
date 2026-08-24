import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(100),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const createOrgSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
});

export const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
});

export const createQueueSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-z0-9-_]+$/),
  description: z.string().optional(),
  priority: z.number().int().min(1).max(100).default(10),
  concurrencyLimit: z.number().int().min(1).max(1000).default(5),
  maxAttempts: z.number().int().min(1).max(100).default(3),
  retentionDays: z.number().int().min(1).max(365).default(30),
  retryPolicy: z
    .object({
      backoffType: z.enum(['FIXED', 'LINEAR', 'EXPONENTIAL']).default('EXPONENTIAL'),
      initialDelayMs: z.number().int().min(100).default(5000),
      maxDelayMs: z.number().int().min(1000).default(300000),
      jitter: z.boolean().default(true),
    })
    .optional(),
  rateLimit: z
    .object({
      limit: z.number().int().min(1),
      windowMs: z.number().int().min(1000),
    })
    .optional(),
});

export const scheduleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('immediate') }),
  z.object({ type: z.literal('delay'), delayMs: z.number().int().min(0) }),
  z.object({ type: z.literal('timestamp'), runAt: z.string().datetime() }),
  z.object({ type: z.literal('cron'), cron: z.string(), timezone: z.string().optional() }),
  z.object({ type: z.literal('recurring'), intervalMs: z.number().int().min(1000) }),
  z.object({ type: z.literal('batch') }),
  z.object({ type: z.literal('workflow'), workflowId: z.string().optional() }),
]);

export const createJobSchema = z.object({
  queue: z.string().min(1),
  name: z.string().min(1).max(200),
  payload: z.record(z.unknown()).default({}),
  priority: z.number().int().min(1).max(100).optional(),
  schedule: scheduleSchema.default({ type: 'immediate' }),
  maxAttempts: z.number().int().min(1).optional(),
});

export const batchJobsSchema = z.object({
  queue: z.string().min(1),
  jobs: z.array(
    z.object({
      name: z.string().min(1),
      payload: z.record(z.unknown()).default({}),
      priority: z.number().int().optional(),
    })
  ).min(1).max(1000),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const jobFilterSchema = paginationSchema.extend({
  status: z.string().optional(),
  queueId: z.string().optional(),
  workerId: z.string().optional(),
  search: z.string().optional(),
  priority: z.coerce.number().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateJobInput = z.infer<typeof createJobSchema>;
export type CreateQueueInput = z.infer<typeof createQueueSchema>;

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['ADMIN', 'OPERATOR', 'DEVELOPER', 'VIEWER']).default('DEVELOPER'),
});

export const updateQueueSchema = createQueueSchema.partial().omit({ name: true });

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

export const createWorkflowSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  nodes: z.array(
    z.object({
      name: z.string().min(1),
      jobName: z.string().min(1),
      queueName: z.string().min(1),
      payload: z.record(z.unknown()).default({}),
      delayMs: z.number().int().min(0).default(0),
      dependsOn: z.array(z.string()).default([]),
    })
  ).min(1),
});

