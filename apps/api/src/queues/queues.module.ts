import { Global, Module } from "@nestjs/common";

import { BullMqQueuePublisher } from "./bullmq-queue.publisher.ts";
import { QUEUE_PUBLISHER } from "./queue.types.ts";

@Global()
@Module({
  providers: [{ provide: QUEUE_PUBLISHER, useClass: BullMqQueuePublisher }],
  exports: [QUEUE_PUBLISHER],
})
export class QueuesModule {}
