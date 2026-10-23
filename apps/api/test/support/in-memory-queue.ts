import type { JiraScanService } from "../../src/modules/jira/jira-scan.service.ts";
import type { RunOrchestrator } from "../../src/modules/runs/run-orchestrator.service.ts";
import type {
  IngestJob,
  PublishOptions,
  QueueJobPayloads,
  QueueName,
  QueuePublisher,
  RunStageJob,
  ScanJob,
  ShipPrJob,
  TicketJob,
  TriageJob,
} from "../../src/queues/queue.types.ts";

/**
 * In-memory queue: dedupes by jobId (like BullMQ) and lets a test drain jobs
 * deterministically through the real orchestrator. Job-level retries are
 * Redis behavior covered by the publisher test.
 */
export class InMemoryQueue implements QueuePublisher {
  readonly jobs: {
    queue: QueueName;
    payload: Record<string, unknown>;
    options?: PublishOptions;
  }[] = [];

  /** Accepted publishes in order, for idempotency-key assertions. */
  readonly history: { queue: QueueName; jobId?: string }[] = [];

  private readonly seen = new Set<string>();

  async publish<Q extends QueueName>(
    queue: Q,
    payload: QueueJobPayloads[Q],
    options?: PublishOptions,
  ): Promise<void> {
    if (options?.jobId) {
      if (this.seen.has(options.jobId)) {
        return;
      }
      this.seen.add(options.jobId);
    }

    this.history.push({
      queue,
      ...(options?.jobId ? { jobId: options.jobId } : {}),
    });
    this.jobs.push({
      queue,
      payload: payload as unknown as Record<string, unknown>,
      options,
    });
  }

  reset(): void {
    this.jobs.length = 0;
    this.history.length = 0;
    this.seen.clear();
  }
}

export async function drainQueue(
  queue: InMemoryQueue,
  orchestrator: RunOrchestrator,
  jiraScan?: JiraScanService,
): Promise<void> {
  while (queue.jobs.length > 0) {
    const job = queue.jobs.shift()!;

    switch (job.queue) {
      case "ingest":
        await orchestrator.handleIngest(job.payload as unknown as IngestJob);
        break;
      case "triage":
        await orchestrator.handleTriage(job.payload as unknown as TriageJob);
        break;
      case "plan":
        await orchestrator.handlePlan(job.payload as unknown as RunStageJob);
        break;
      case "code":
        await orchestrator.handleCode(job.payload as unknown as RunStageJob);
        break;
      case "validate":
        await orchestrator.handleValidate(
          job.payload as unknown as RunStageJob,
        );
        break;
      case "pr":
        await orchestrator.handleShipPr(job.payload as unknown as ShipPrJob);
        break;
      case "ticket":
        await orchestrator.handleCreateTicket(
          job.payload as unknown as TicketJob,
        );
        break;
      case "scan": {
        if (!jiraScan) {
          throw new Error("drainQueue needs the JiraScanService to run scans");
        }

        await jiraScan.run(job.payload as unknown as ScanJob);
        break;
      }
    }
  }
}
