import { Injectable, Logger, Optional } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service.ts";
import { MetricsService } from "../metrics/metrics.service.ts";

const BATCH_SIZE = 1_000;

/**
 * Nulls expired webhook raw payloads in batches via the SECURITY DEFINER
 * helper. Rows are kept (idempotency key + hash); only the payload is cleared.
 */
@Injectable()
export class RawPayloadJanitor {
  private readonly logger = new Logger(RawPayloadJanitor.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  async run(): Promise<{ purged: number }> {
    let purged = 0;
    const now = new Date();

    for (;;) {
      const affected = await this.prisma.client.$queryRaw<{ count: number }[]>`
        SELECT codebeast_purge_raw_payloads(${now}::timestamptz, ${BATCH_SIZE}::int) AS count
      `;
      const batch = Number(affected[0]?.count ?? 0);
      purged += batch;

      if (batch < BATCH_SIZE) {
        break;
      }
    }

    if (purged > 0) {
      this.logger.log(`raw-payload janitor: purged ${purged} payloads`);
      this.metrics?.recordMaintenance("raw_payload", "purged", purged);
    }

    return { purged };
  }
}
