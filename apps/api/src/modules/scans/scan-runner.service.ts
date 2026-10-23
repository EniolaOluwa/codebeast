import { Inject, Injectable, Logger } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service.ts";
import type { ScanJob } from "../../queues/queue.types.ts";
import {
  SOURCE_SCANNERS,
  type SourceScanner,
  type SourceScanResult,
} from "./source-scanner.ts";

/** Dispatches a scan job to the scanner registered for the integration type. */
@Injectable()
export class ScanRunner {
  private readonly logger = new Logger(ScanRunner.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SOURCE_SCANNERS) private readonly scanners: SourceScanner[],
  ) {}

  async run(job: ScanJob): Promise<SourceScanResult> {
    const integration = await this.prisma.withTenant(job.tenantId, (tx) =>
      tx.integration.findFirst({
        where: { id: job.integrationId, tenantId: job.tenantId },
        select: { type: true },
      }),
    );

    if (!integration) {
      this.logger.warn(
        `scan skipped: integration ${job.integrationId} not found`,
      );
      return { scanned: 0, imported: 0 };
    }

    const scanner = this.scanners.find(
      (candidate) => candidate.type === integration.type,
    );

    if (!scanner) {
      this.logger.warn(
        `scan skipped: no scanner registered for ${integration.type}`,
      );
      return { scanned: 0, imported: 0 };
    }

    return scanner.run(job);
  }
}
