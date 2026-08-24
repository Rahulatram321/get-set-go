export interface JobResult {
  success: boolean;
  error?: string;
  stackTrace?: string;
  stdout?: string;
  stderr?: string;
}

const handlers: Record<string, (payload: Record<string, unknown>) => Promise<JobResult>> = {
  'send-welcome-email': async (payload) => {
    await simulateWork(500, 1500);
    if (payload.forceFail) {
      return { success: false, error: 'SMTP connection timeout while sending welcome email' };
    }
    return { success: true, stdout: `Email sent to ${payload.email ?? 'user@example.com'}` };
  },

  'process-payment': async (payload) => {
    await simulateWork(800, 2000);
    if (payload.forceFail) {
      return { success: false, error: 'Payment gateway returned 503 Service Unavailable' };
    }
    return { success: true, stdout: `Payment processed: $${payload.amount ?? 0}` };
  },

  'generate-report': async (payload) => {
    await simulateWork(1000, 3000);
    return { success: true, stdout: `Report generated: ${payload.reportType ?? 'daily'}` };
  },

  'send-notification': async (payload) => {
    await simulateWork(300, 800);
    if (Math.random() < 0.05) {
      return { success: false, error: 'Push notification service unreachable' };
    }
    return { success: true, stdout: `Notification sent: ${payload.message ?? 'Hello'}` };
  },

  'analytics-event': async (payload) => {
    await simulateWork(200, 500);
    return { success: true, stdout: `Event tracked: ${payload.event ?? 'page_view'}` };
  },

  'data-sync': async (payload) => {
    await simulateWork(2000, 5000);
    if (payload.forceFail) {
      return { success: false, error: 'Database connection refused during sync' };
    }
    return { success: true, stdout: 'Data sync completed' };
  },

  'health-check': async () => {
    await simulateWork(100, 300);
    return { success: true, stdout: 'Health check passed' };
  },
};

async function simulateWork(minMs: number, maxMs: number) {
  const delay = minMs + Math.random() * (maxMs - minMs);
  await new Promise((r) => setTimeout(r, delay));
}

export async function executeJobHandler(
  name: string,
  payload: Record<string, unknown>
): Promise<JobResult> {
  const handler = handlers[name];
  if (!handler) {
    await simulateWork(500, 1500);
    if (Math.random() < 0.1) {
      return { success: false, error: `Unknown handler "${name}" simulated failure` };
    }
    return { success: true, stdout: `Generic handler executed: ${name}` };
  }
  return handler(payload);
}

export function getHandlerNames(): string[] {
  return Object.keys(handlers);
}
