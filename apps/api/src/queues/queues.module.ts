import { Global, Module } from "@nestjs/common";

import { LoggingQueuePublisher } from "./logging-queue.publisher.ts";
import { QUEUE_PUBLISHER } from "./queue.types.ts";

@Global()
@Module({
  providers: [{ provide: QUEUE_PUBLISHER, useClass: LoggingQueuePublisher }],
  exports: [QUEUE_PUBLISHER],
})
export class QueuesModule {}
