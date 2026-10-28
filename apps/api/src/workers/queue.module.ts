import { BullModule } from "@nestjs/bullmq";
import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { RunsModule } from "../modules/runs/runs.module.ts";
import { PIPELINE_ENQUEUER, PIPELINE_QUEUE } from "./pipeline.constants.ts";
import { PipelineProcessor } from "./pipeline.processor.ts";
import { PipelineQueue } from "./pipeline.queue.ts";
import { PipelineRunner } from "./pipeline.runner.ts";

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.getOrThrow<string>("REDIS_URL") },
      }),
    }),
    BullModule.registerQueue({ name: PIPELINE_QUEUE }),
    RunsModule,
  ],
  providers: [
    PipelineRunner,
    PipelineProcessor,
    { provide: PIPELINE_ENQUEUER, useClass: PipelineQueue },
  ],
  exports: [PIPELINE_ENQUEUER],
})
export class QueueModule {}
