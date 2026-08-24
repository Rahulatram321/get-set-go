import cronParser from 'cron-parser';

export function parseNextCronRun(cronExpression: string, timezone = 'UTC'): Date {
  const interval = cronParser.parseExpression(cronExpression, {
    tz: timezone,
    currentDate: new Date(),
  });
  return interval.next().toDate();
}

export function isValidCron(cronExpression: string): boolean {
  try {
    cronParser.parseExpression(cronExpression);
    return true;
  } catch {
    return false;
  }
}

export function calculateNextRun(
  scheduleType: string,
  options: {
    cron?: string;
    intervalMs?: number;
    runAt?: Date;
    timezone?: string;
    lastRunAt?: Date;
  }
): Date {
  const now = new Date();

  switch (scheduleType) {
    case 'CRON':
      if (!options.cron) throw new Error('Cron expression required');
      return parseNextCronRun(options.cron, options.timezone);
    case 'RECURRING':
      if (!options.intervalMs) throw new Error('Interval required');
      const base = options.lastRunAt ?? now;
      return new Date(base.getTime() + options.intervalMs);
    case 'TIMESTAMP':
      return options.runAt ?? now;
    case 'DELAY':
      return new Date(now.getTime() + (options.intervalMs ?? 0));
    default:
      return now;
  }
}
