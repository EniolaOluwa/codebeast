import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import { Redis } from "ioredis";

import type {
  PublishOptions,
  QueueJobPayloads,
  QueueName,
  QueuePublisher,
} from "./queue.types.ts";

/**
 * Real publisher (ADR-004). Notes:
 * - BullMQ under native ESM requires an explicit client instance, so the
 *   connection is an eagerly-declared (lazily connected) ioredis client.
 * - `jobId` doubles as the idempotency key; the id may not contain `:`.
 * - completed jobs are removed so ids free up (triage coalescing reuses one);
 *   transient failures retry with exponential backoff.
 */
@Injectable()
export class BullMqQueuePublisher implements QueuePublisher, OnModuleDestroy {
  private readonly logger = new Logger(BullMqQueuePublisher.name);
  private readonly queues = new Map<QueueName, Queue>();
  private readonly connection: Redis;

  constructor(config: ConfigService) {
    this.connection = new Redis(config.getOrThrow<string>("REDIS_URL"), {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
  }

  async publish<Q extends QueueName>(
    queue: Q,
    payload: QueueJobPayloads[Q],
    options?: PublishOptions,
  ): Promise<void> {
    const job = await this.queue(queue).add(queue, payload, {
      ...(options?.jobId ? { jobId: options.jobId } : {}),
      ...(options?.delayMs ? { delay: options.delayMs } : {}),
      attempts: 3,
      backoff: { type: "exponential", delay: 3_000 },
      removeOnComplete: true,
      removeOnFail: true,
    });

    this.logger.log(`queued ${queue}:${job.id ?? "?"}`);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    // Immediate: no pending commands need flushing and tests may never have
    // connected this client at all.
    this.connection.disconnect();
  }

  private queue(name: QueueName): Queue {
    let instance = this.queues.get(name);

    if (!instance) {
      instance = new Queue(name, { connection: this.connection });
      this.queues.set(name, instance);
    }

    return instance;
  }
}
