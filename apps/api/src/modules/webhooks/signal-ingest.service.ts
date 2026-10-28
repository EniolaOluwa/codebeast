import { Inject, Injectable, Logger } from "@nestjs/common";
import type { NormalizedSignal } from "@repo/types";

import { PrismaService } from "../../prisma/prisma.service.ts";
import {
  QUEUE_PUBLISHER,
  type QueuePublisher,
} from "../../queues/queue.types.ts";
import { RuleEngine } from "../rules/rule-engine.service.ts";
import { CorrelationService } from "./correlation.service.ts";

export interface IngestedSignalOutcome {
  issueId: string;
  signalId: string | null;
  issueCreated: boolean;
  signalAttached: boolean;
  ignoredByRule?: boolean;
}

/**
 * Batch signal ingestion shared by backfill scanners (Jira, Discord,
 * Freshdesk). Webhook deliveries keep their own claim-then-correlate
 * transaction in the pipeline; both paths end in the same correlation
 * service, the same detection rules and the same `ingest` queue.
 */
@Injectable()
export class SignalIngestService {
  private readonly logger = new Logger(SignalIngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly correlation: CorrelationService,
    private readonly ruleEngine: RuleEngine,
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

      // Detection rules gate brand-new reports (design.md §8.5): an ignored
      // report is recorded but never enters the compute pipeline.
      if (correlated.issueCreated) {
        const detection = await this.ruleEngine.evaluateDetection(tenantId, {
          providers: [signal.provider],
          signalCount: 1,
          title: signal.title,
        });

        if (detection.action === "IGNORE") {
          await this.prisma.withTenant(tenantId, async (tx) => {
            await tx.issue.update({
              where: { id: correlated.issueId },
              data: { status: "IGNORED" },
            });
          });

          this.logger.log(
            `detection rule ${detection.ruleId} ignored issue ${correlated.issueId}`,
          );

          outcomes.push({ ...correlated, ignoredByRule: true });
          continue;
        }
      }

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
