import { Inject, Injectable } from "@nestjs/common";
import type { ThrottlerStorage } from "@nestjs/throttler";
import type { Redis } from "ioredis";

import { REDIS_CLIENT } from "../../redis/redis.tokens.ts";

interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/**
 * Atomic Redis-backed throttler storage so limits are shared across API
 * instances. Uses a Lua script for INCR + PEXPIRE in one round trip.
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly script = `
    local key = KEYS[1]
    local ttl = tonumber(ARGV[1])
    local current = redis.call('INCR', key)
    if current == 1 then
      redis.call('PEXPIRE', key, ttl)
    end
    local pttl = redis.call('PTTL', key)
    if pttl < 0 then
      redis.call('PEXPIRE', key, ttl)
      pttl = ttl
    end
    return { current, pttl }
  `;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const storageKey = `throttle:${throttlerName}:${key}`;
    const result = (await this.redis.eval(
      this.script,
      1,
      storageKey,
      String(ttl),
    )) as [number, number];

    const totalHits = Number(result[0]);
    const timeToExpire = Math.max(0, Number(result[1]));
    const isBlocked = totalHits > limit;
    const timeToBlockExpire = isBlocked
      ? blockDuration > 0
        ? blockDuration
        : timeToExpire
      : 0;

    return {
      totalHits,
      timeToExpire: Math.ceil(timeToExpire / 1000),
      isBlocked,
      timeToBlockExpire: Math.ceil(timeToBlockExpire / 1000),
    };
  }
}
