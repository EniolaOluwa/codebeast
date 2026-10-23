import type { Provider } from "@repo/types";

/**
 * Queue contract for the agent pipeline (ADR-004). M3 ships the interface and
 * a logging publisher so ingestion is fully testable without Redis; M4 swaps
 * in the BullMQ implementation behind the same token.
 */

export const QUEUE_NAMES = [
  "ingest",
  "triage",
  "plan",
  "code",
  "validate",
  "pr",
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

export interface IngestJob {
  tenantId: string;
  issueId: string;
  signalId?: string;
}

export interface RunStageJob {
  tenantId: string;
  runId: string;
}

export interface QueueJobPayloads {
  ingest: IngestJob;
  triage: RunStageJob;
  plan: RunStageJob;
  code: RunStageJob;
  validate: RunStageJob;
  pr: RunStageJob;
}

export interface PublishOptions {
  /** Idempotency key, e.g. `runId:stage:attempt`. */
  jobId?: string;
  delayMs?: number;
}

export interface QueuePublisher {
  publish<Q extends QueueName>(
    queue: Q,
    payload: QueueJobPayloads[Q],
    options?: PublishOptions,
  ): Promise<void>;
}

export const QUEUE_PUBLISHER = Symbol("QUEUE_PUBLISHER");

/** Exported for the webhook tests and for the M4 publisher swap. */
export interface ProviderSignal {
  provider: Provider;
  externalId: string;
}
