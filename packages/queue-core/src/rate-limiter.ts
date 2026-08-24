import Redis from 'ioredis';

export class RateLimiter {
  constructor(private readonly redis: Redis) {}

  async checkLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
    const now = Date.now();
    const windowStart = now - windowMs;
    const redisKey = `ratelimit:${key}`;

    const pipeline = this.redis.pipeline();
    pipeline.zremrangebyscore(redisKey, 0, windowStart);
    pipeline.zadd(redisKey, now, `${now}-${Math.random()}`);
    pipeline.zcard(redisKey);
    pipeline.pexpire(redisKey, windowMs);

    const results = await pipeline.exec();
    const count = (results?.[2]?.[1] as number) ?? 0;

    return count <= limit;
  }
}
