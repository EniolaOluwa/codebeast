import { Inject, Injectable, Logger } from "@nestjs/common";
import type { NormalizedSignal } from "@repo/types";

import {
  FRESHDESK_CLIENT,
  type FreshdeskClient,
} from "../../clients/freshdesk.client.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";
import type { ScanJob } from "../../queues/queue.types.ts";
import {
  recordScan,
  type SourceScanner,
  type SourceScanResult,
} from "../scans/source-scanner.ts";
import { freshdeskTicketToSignal } from "../webhooks/normalizers.ts";
import { SignalIngestService } from "../webhooks/signal-ingest.service.ts";

const TICKETS_PER_SCAN = 30;

/**
 * Freshdesk as a source: scans recent conversations so existing items become
 * reports (webhook deliveries arrive through the webhook pipeline instead).
 */
@Injectable()
export class FreshdeskScanService implements SourceScanner {
  readonly type = "FRESHDESK" as const;

  private readonly logger = new Logger(FreshdeskScanService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(FRESHDESK_CLIENT) private readonly freshdesk: FreshdeskClient,
    private readonly ingest: SignalIngestService,
  ) {}

  async run(job: ScanJob): Promise<SourceScanResult> {
    const integration = await this.prisma.withTenant(job.tenantId, (tx) =>
      tx.integration.findFirst({
        where: {
          id: job.integrationId,
          tenantId: job.tenantId,
          type: "FRESHDESK",
        },
      }),
    );

    if (!integration || !integration.enabled) {
      this.logger.warn(
        `scan skipped: Freshdesk integration ${job.integrationId} not found or disabled`,
      );
      return { scanned: 0, imported: 0 };
    }

    const config = (integration.config ?? {}) as { domain?: string };

    if (!config.domain) {
      this.logger.warn(
        `scan skipped: Freshdesk integration ${integration.id} has no domain configured`,
      );
      return { scanned: 0, imported: 0 };
    }

    const tickets = await this.freshdesk.fetchTickets({
      tenantId: job.tenantId,
      limit: TICKETS_PER_SCAN,
    });

    const signals: NormalizedSignal[] = tickets.map((ticket) =>
      freshdeskTicketToSignal(ticket, { domain: config.domain! }),
    );

    const outcomes = await this.ingest.ingest(job.tenantId, signals);
    const imported = outcomes.filter(
      (outcome) => outcome.signalAttached,
    ).length;

    await recordScan(this.prisma, {
      tenantId: job.tenantId,
      integrationId: integration.id,
      config: integration.config,
      found: signals.length,
    });

    this.logger.log(
      `freshdesk scan ${integration.id}: ${signals.length} conversations, ${imported} new signals`,
    );

    return { scanned: signals.length, imported };
  }
}
