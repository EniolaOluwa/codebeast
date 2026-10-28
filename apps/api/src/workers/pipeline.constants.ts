export const PIPELINE_QUEUE = "pipeline";
export const PIPELINE_ENQUEUER = Symbol("PIPELINE_ENQUEUER");

export interface PipelineEnqueuer {
  enqueueRun(runId: string): Promise<void>;
}

export interface PipelineJobData {
  runId: string;
}
