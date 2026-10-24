import { Injectable, Logger } from "@nestjs/common";

import type { PipelineEnqueuer } from "./pipeline.constants.ts";

/** Used when QUEUE_ENABLED=false (tests, single-process dev without Redis). */
@Injectable()
export class NoopPipelineEnqueuer implements PipelineEnqueuer {
  private readonly logger = new Logger(NoopPipelineEnqueuer.name);

  enqueueRun(runId: string): Promise<void> {
    this.logger.warn(
      `Queue disabled; run=${runId} was not dispatched to a worker`,
    );
    return Promise.resolve();
  }
}
