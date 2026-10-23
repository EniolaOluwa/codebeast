import type { Provider } from "@repo/types";

import type { PrismaService } from "../../prisma/prisma.service.ts";
import type { ScanJob } from "../../queues/queue.types.ts";

export interface SourceScanResult {
  scanned: number;
  imported: number;
}

/**
 * One scanner per pollable source (Jira, Discord, Freshdesk). Scanners reuse
 * `SignalIngestService`, so scanned items flow through the same correlation
 * pipeline as webhook deliveries.
 */
export interface SourceScanner {
  readonly type: Provider;
  run(job: ScanJob): Promise<SourceScanResult>;
}

export const SOURCE_SCANNERS = Symbol("SOURCE_SCANNERS");

/** Sources that expose a backfill scan (mirrored in the console UI). */
export const SCANNABLE_PROVIDERS: Provider[] = ["JIRA", "DISCORD", "FRESHDESK"];

/** Writes last-scan bookkeeping into the integration config (Sources UI). */
export async function recordScan(
  prisma: PrismaService,
  input: {
    tenantId: string;
    integrationId: string;
    config: unknown;
    found: number;
  },
): Promise<void> {
  const config = (input.config ?? {}) as Record<string, unknown>;

  await prisma.withTenant(input.tenantId, async (tx) => {
    await tx.integration.update({
      where: { id: input.integrationId },
      data: {
        config: {
          ...config,
          lastScanAt: new Date().toISOString(),
          lastScanFound: input.found,
        },
      },
    });
  });
}
