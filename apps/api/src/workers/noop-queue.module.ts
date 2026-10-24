import { Global, Module } from "@nestjs/common";

import { NoopPipelineEnqueuer } from "./noop-pipeline.enqueuer.ts";
import { PIPELINE_ENQUEUER } from "./pipeline.constants.ts";

@Global()
@Module({
  providers: [{ provide: PIPELINE_ENQUEUER, useClass: NoopPipelineEnqueuer }],
  exports: [PIPELINE_ENQUEUER],
})
export class NoopQueueModule {}
