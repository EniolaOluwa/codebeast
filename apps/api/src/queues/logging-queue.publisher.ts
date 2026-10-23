import { Injectable, Logger } from "@nestjs/common";

import type {
  PublishOptions,
  QueueJobPayloads,
  QueueName,
  QueuePublisher,
} from "./queue.types.ts";

/**
 * M3 stand-in for BullMQ: records the publish in the log so ingestion can be
 * exercised end to end without Redis. Replaced in M4 (same token).
 */
@Injectable()
export class LoggingQueuePublisher implements QueuePublisher {
  private readonly logger = new Logger(LoggingQueuePublisher.name);

  async publish<Q extends QueueName>(
    queue: Q,
    payload: QueueJobPayloads[Q],
    options?: PublishOptions,
  ): Promise<void> {
    this.logger.log(
      `publish ${queue} ${JSON.stringify(payload)}${options?.jobId ? ` jobId=${options.jobId}` : ""}`,
    );
  }
}
