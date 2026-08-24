import pino from 'pino';

export interface LoggerOptions {
  name: string;
  level?: string;
  pretty?: boolean;
}

export function createLogger(options: LoggerOptions) {
  const isDev = process.env.NODE_ENV !== 'production';
  return pino({
    name: options.name,
    level: options.level ?? process.env.LOG_LEVEL ?? 'info',
    ...(options.pretty !== false && isDev
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'SYS:standard' },
          },
        }
      : {}),
  });
}

export type Logger = ReturnType<typeof createLogger>;

export function childLogger(logger: Logger, bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
