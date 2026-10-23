import { Inject, Injectable, Logger } from "@nestjs/common";
import { type NormalizedSignal, normalizedSignalSchema } from "@repo/types";

import {
  DISCORD_CLIENT,
  type DiscordClient,
} from "../../clients/discord.client.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";
import type { ScanJob } from "../../queues/queue.types.ts";
import {
  recordScan,
  type SourceScanner,
  type SourceScanResult,
} from "../scans/source-scanner.ts";
import { discordMessageToSignal } from "../webhooks/normalizers.ts";
import { SignalIngestService } from "../webhooks/signal-ingest.service.ts";

const MESSAGES_PER_CHANNEL = 50;

/**
 * Discord as a source: polls configured channels through the REST API (bots
 * cannot receive message webhooks) and feeds messages through the shared
 * signal pipeline. Bot-authored messages are skipped.
 */
@Injectable()
export class DiscordScanService implements SourceScanner {
  readonly type = "DISCORD" as const;

  private readonly logger = new Logger(DiscordScanService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(DISCORD_CLIENT) private readonly discord: DiscordClient,
    private readonly ingest: SignalIngestService,
  ) {}

  async run(job: ScanJob): Promise<SourceScanResult> {
    const integration = await this.prisma.withTenant(job.tenantId, (tx) =>
      tx.integration.findFirst({
        where: {
          id: job.integrationId,
          tenantId: job.tenantId,
          type: "DISCORD",
        },
      }),
    );

    if (!integration || !integration.enabled) {
      this.logger.warn(
        `scan skipped: Discord integration ${job.integrationId} not found or disabled`,
      );
      return { scanned: 0, imported: 0 };
    }

    const config = (integration.config ?? {}) as {
      guildId?: string;
      channelIds?: unknown[];
    };
    const channelIds = (config.channelIds ?? []).filter(
      (id): id is string => typeof id === "string" && id.length > 0,
    );

    if (channelIds.length === 0) {
      this.logger.warn(
        `scan skipped: Discord integration ${integration.id} has no channelIds configured`,
      );
      return { scanned: 0, imported: 0 };
    }

    const signals: NormalizedSignal[] = [];

    for (const channelId of channelIds) {
      const messages = await this.discord.fetchMessages({
        tenantId: job.tenantId,
        channelId,
        limit: MESSAGES_PER_CHANNEL,
      });

      for (const message of messages) {
        if (message.author?.bot) {
          continue;
        }

        signals.push(
          normalizedSignalSchema.parse(
            discordMessageToSignal(message, {
              guildId: config.guildId ?? null,
            }),
          ),
        );
      }
    }

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
      `discord scan ${integration.id}: ${signals.length} messages, ${imported} new signals`,
    );

    return { scanned: signals.length, imported };
  }
}
