import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { RateLimiter } from '@orbitqueue/queue-core';
import { RateLimitError } from '@orbitqueue/shared';
import type { Env } from '@orbitqueue/config';

export async function rateLimitPlugin(app: FastifyInstance, env: Env) {
  const limit = env.API_RATE_LIMIT;
  const windowMs = 60_000;
  const rateLimiter = new RateLimiter(app.redis);

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const publicPaths = ['/health', '/metrics', '/docs', '/ws', '/auth/'];
    if (publicPaths.some((p) => request.url.startsWith(p))) return;

    const key = request.userId ?? request.ip;
    try {
      const allowed = await rateLimiter.checkLimit(`api:${key}`, limit, windowMs);
      if (!allowed) {
        reply.status(429);
        throw new RateLimitError();
      }
    } catch (err) {
      if (err instanceof RateLimitError) throw err;
    }
  });
}
