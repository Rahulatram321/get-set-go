import Redis from 'ioredis';

export class DistributedLock {
  constructor(private readonly redis: Redis) {}

  async acquire(key: string, ttlMs: number, ownerId: string): Promise<boolean> {
    const result = await this.redis.set(key, ownerId, 'PX', ttlMs, 'NX');
    return result === 'OK';
  }

  async release(key: string, ownerId: string): Promise<boolean> {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    const result = await this.redis.eval(script, 1, key, ownerId);
    return result === 1;
  }

  async extend(key: string, ownerId: string, ttlMs: number): Promise<boolean> {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("pexpire", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;
    const result = await this.redis.eval(script, 1, key, ownerId, ttlMs);
    return result === 1;
  }

  async withLock<T>(
    key: string,
    ttlMs: number,
    ownerId: string,
    fn: () => Promise<T>
  ): Promise<T | null> {
    const acquired = await this.acquire(key, ttlMs, ownerId);
    if (!acquired) return null;

    try {
      return await fn();
    } finally {
      await this.release(key, ownerId);
    }
  }
}

export function createRedisClient(url: string): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });
}
