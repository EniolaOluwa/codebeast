import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { Queue } from "bullmq";

import { PIPELINE_QUEUE, type PipelineEnqueuer } from "./pipeline.constants.ts";

@Injectable()
export class PipelineQueue implements PipelineEnqueuer {
  private readonly logger = new Logger(PipelineQueue.name);

  constructor(@InjectQueue(PIPELINE_QUEUE) private readonly queue: Queue) {}

  async enqueueRun(runId: string): Promise<void> {
    await this.queue.add(
      "run",
      { runId },
      {
        jobId: `run:${runId}`,
        attempts: 1,
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    );
    this.logger.log(`Enqueued pipeline run=${runId}`);
  }
}
