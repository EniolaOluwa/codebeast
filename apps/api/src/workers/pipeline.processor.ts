import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";

import { PIPELINE_QUEUE, type PipelineJobData } from "./pipeline.constants.ts";
import { PipelineRunner } from "./pipeline.runner.ts";

@Processor(PIPELINE_QUEUE)
export class PipelineProcessor extends WorkerHost {
  private readonly logger = new Logger(PipelineProcessor.name);

  constructor(private readonly runner: PipelineRunner) {
    super();
  }

  async process(job: Job<PipelineJobData>): Promise<void> {
    this.logger.log(`Processing pipeline run=${job.data.runId}`);
    await this.runner.run(job.data.runId);
  }
}
