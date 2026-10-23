import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  MAX_SIGNAL_BODY_BYTES,
  MAX_SIGNAL_TITLE_CHARS,
  type NormalizedSignal,
  normalizedSignalSchema,
  truncateToBytes,
} from "@repo/types";

import { JIRA_CLIENT, type JiraClient } from "../../clients/jira.client.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";
import type { ScanJob } from "../../queues/queue.types.ts";
import {
  recordScan,
  type SourceScanner,
  type SourceScanResult,
} from "../scans/source-scanner.ts";
import { SignalIngestService } from "../webhooks/signal-ingest.service.ts";

/**
 * Jira as a source: pulls existing items (JQL from the integration config)
 * through the same correlation pipeline webhooks use, so scanned issues
 * become reports that run the normal compute pipeline.
 */
@Injectable()
export class JiraScanService implements SourceScanner {
  readonly type = "JIRA" as const;

  private readonly logger = new Logger(JiraScanService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(JIRA_CLIENT) private readonly jira: JiraClient,
    private readonly ingest: SignalIngestService,
  ) {}

  async run(job: ScanJob): Promise<SourceScanResult> {
    const integration = await this.prisma.withTenant(job.tenantId, (tx) =>
      tx.integration.findFirst({
        where: {
          id: job.integrationId,
          tenantId: job.tenantId,
          type: "JIRA",
        },
      }),
    );

    if (!integration || !integration.enabled) {
      this.logger.warn(
        `scan skipped: Jira integration ${job.integrationId} not found or disabled`,
      );
      return { scanned: 0, imported: 0 };
    }

    const items = await this.jira.scan({ tenantId: job.tenantId });
    const now = new Date().toISOString();

    const signals: NormalizedSignal[] = items.map((item) =>
      normalizedSignalSchema.parse({
        provider: "JIRA",
        externalId: item.key,
        eventType: "jira.scan",
        title: cut(item.summary, MAX_SIGNAL_TITLE_CHARS),
        body: truncateToBytes(
          [item.description, item.url].filter(Boolean).join("\n"),
          MAX_SIGNAL_BODY_BYTES,
        ),
        url: item.url,
        actor: null,
        occurredAt: item.created ? new Date(item.created).toISOString() : now,
        correlationKey: `jira:issue:${item.key}`,
        repositoryHint: null,
      }),
    );

    const outcomes = await this.ingest.ingest(job.tenantId, signals);
    const imported = outcomes.filter(
      (outcome) => outcome.signalAttached,
    ).length;

    await recordScan(this.prisma, {
      tenantId: job.tenantId,
      integrationId: integration.id,
      config: integration.config,
      found: items.length,
    });

    this.logger.log(
      `jira scan ${integration.id}: ${items.length} items scanned, ${imported} new signals`,
    );

    return { scanned: items.length, imported };
  }
}

function cut(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
