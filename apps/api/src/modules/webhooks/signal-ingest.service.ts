import { Inject, Injectable } from "@nestjs/common";
import type { NormalizedSignal } from "@repo/types";

import { PrismaService } from "../../prisma/prisma.service.ts";
import {
  QUEUE_PUBLISHER,
  type QueuePublisher,
} from "../../queues/queue.types.ts";
import { CorrelationService } from "./correlation.service.ts";

export interface IngestedSignalOutcome {
  issueId: string;
  signalId: string | null;
  issueCreated: boolean;
  signalAttached: boolean;
}

/**
 * Batch signal ingestion shared by backfill scanners (Jira now; Discord and
 * Freshdesk later). Webhook deliveries keep their own claim-then-correlate
 * transaction in the pipeline (they need delivery idempotency); both paths
 * end in the same correlation service and the same `ingest` queue.
 */
@Injectable()
export class SignalIngestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly correlation: CorrelationService,
    @Inject(QUEUE_PUBLISHER) private readonly publisher: QueuePublisher,
  ) {}

  async ingest(
    tenantId: string,
    signals: NormalizedSignal[],
  ): Promise<IngestedSignalOutcome[]> {
    const outcomes: IngestedSignalOutcome[] = [];

    for (const signal of signals) {
      const correlated = await this.prisma.withTenant(tenantId, (tx) =>
        this.correlation.correlate(tx, tenantId, signal),
      );

      outcomes.push(correlated);

      await this.publisher.publish("ingest", {
        tenantId,
        issueId: correlated.issueId,
        ...(correlated.signalId ? { signalId: correlated.signalId } : {}),
      });
    }

    return outcomes;
  }
}
