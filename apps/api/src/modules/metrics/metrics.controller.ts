import {
  Controller,
  Get,
  Header,
  Headers,
  Inject,
  Optional,
  Res,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiExcludeController } from "@nestjs/swagger";
import { Queue } from "bullmq";
import type { FastifyReply } from "fastify";
import type { Redis } from "ioredis";

import { Public } from "../../common/auth/decorators.ts";
import { UnauthorizedError } from "../../common/errors/errors.ts";
import { QUEUE_NAMES } from "../../queues/queue.types.ts";
import { REDIS_CLIENT } from "../../redis/redis.tokens.ts";
import { MetricsService } from "./metrics.service.ts";

@ApiExcludeController()
@Public()
@Controller()
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly config: ConfigService,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  @Get("metrics")
  @Header("content-type", "text/plain; version=0.0.4; charset=utf-8")
  async scrape(
    @Headers("authorization") authorization: string | undefined,
    @Res({ passthrough: true }) _reply: FastifyReply,
  ): Promise<string> {
    const token = this.config.get<string>("METRICS_TOKEN");
    if (token) {
      const expected = `Bearer ${token}`;
      if (authorization !== expected) {
        throw new UnauthorizedError("Invalid metrics token");
      }
    }

    await this.refreshQueueGauges();
    return this.metrics.render();
  }

  private async refreshQueueGauges(): Promise<void> {
    if (!this.redis) {
      return;
    }

    for (const name of QUEUE_NAMES) {
      const queue = new Queue(name, { connection: this.redis });
      try {
        const counts = await queue.getJobCounts(
          "waiting",
          "active",
          "delayed",
          "failed",
          "completed",
        );
        for (const [state, value] of Object.entries(counts)) {
          this.metrics.queueJobs.set({ queue: name, state }, value);
        }
      } finally {
        await queue.close();
      }
    }
  }
}
