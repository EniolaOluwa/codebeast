import {
  Global,
  Inject,
  Injectable,
  Module,
  type OnModuleDestroy,
  type Provider,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Redis } from "ioredis";

import { RedisThrottlerStorage } from "../common/throttler/redis-throttler.storage.ts";
import { REDIS_CLIENT } from "./redis.tokens.ts";

/**
 * Shared non-BullMQ Redis client for readiness probes, throttler storage, and
 * metrics scrapes. BullMQ publisher/workers keep their own connections —
 * workers need dedicated blocking clients.
 */
const redisClientProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Redis =>
    new Redis(config.getOrThrow<string>("REDIS_URL"), {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    }),
};

@Injectable()
class RedisLifecycle implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}

@Global()
@Module({
  providers: [redisClientProvider, RedisLifecycle, RedisThrottlerStorage],
  exports: [REDIS_CLIENT, RedisThrottlerStorage],
})
export class RedisModule {}
