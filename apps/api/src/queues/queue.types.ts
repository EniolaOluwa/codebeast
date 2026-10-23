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
  "ticket",
  "scan",
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

export interface IngestJob {
  tenantId: string;
  issueId: string;
  signalId?: string;
}

/** Coalesced per issue: one delayed triage job per issue per window. */
export interface TriageJob {
  tenantId: string;
  issueId: string;
}

export interface RunStageJob {
  tenantId: string;
  runId: string;
}

/** Ship request: open the pull request for a READY issue (compute/ship split). */
export interface ShipPrJob {
  tenantId: string;
  issueId: string;
}

/** Ship request: create the Jira ticket for a READY issue. */
export interface TicketJob {
  tenantId: string;
  issueId: string;
}

/** Backfill request: scan a source integration for existing items to fix. */
export interface ScanJob {
  tenantId: string;
  integrationId: string;
}

export interface QueueJobPayloads {
  ingest: IngestJob;
  triage: TriageJob;
  plan: RunStageJob;
  code: RunStageJob;
  validate: RunStageJob;
  pr: ShipPrJob;
  ticket: TicketJob;
  scan: ScanJob;
}

export interface PublishOptions {
  /** Idempotency key, e.g. `run-<runId>-<stage>-<attempt>` (no `:`, BullMQ). */
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
