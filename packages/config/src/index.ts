import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url().or(z.string().startsWith('postgresql://')),
  REDIS_URL: z.string().url().or(z.string().startsWith('redis://')),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('7d'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('30d'),
  API_PORT: z.coerce.number().default(3001),
  API_URL: z.string().default('http://localhost:3001'),
  WEB_URL: z.string().default('http://localhost:3000'),
  WORKER_CONCURRENCY: z.coerce.number().default(10),
  WORKER_HEARTBEAT_INTERVAL_MS: z.coerce.number().default(5000),
  WORKER_LEASE_DURATION_MS: z.coerce.number().default(60000),
  WORKER_SHUTDOWN_TIMEOUT_MS: z.coerce.number().default(30000),
  SCHEDULER_POLL_INTERVAL_MS: z.coerce.number().default(5000),
  SCHEDULER_LEADER_LOCK_TTL_MS: z.coerce.number().default(15000),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  AI_API_KEY: z.string().optional().default(''),
  AI_ENABLED: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  API_RATE_LIMIT: z.coerce.number().default(100),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function loadEnv(overrides?: Partial<Record<keyof Env, string>>): Env {
  if (cachedEnv && !overrides) return cachedEnv;

  const parsed = envSchema.safeParse({ ...process.env, ...overrides });
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    throw new Error(`Invalid environment configuration: ${JSON.stringify(errors)}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

export function resetEnvCache(): void {
  cachedEnv = null;
}
