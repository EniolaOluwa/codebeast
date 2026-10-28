import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { RunStatus } from "@repo/types";

import { PrismaService } from "../../prisma/prisma.service.ts";
import {
  QUEUE_PUBLISHER,
  type QueueName,
  type QueuePublisher,
} from "../../queues/queue.types.ts";
import { AuditService } from "../audit/audit.service.ts";
import { MetricsService } from "../metrics/metrics.service.ts";
import {
  beginRun,
  decideAfterStage,
  type RunState,
} from "../runs/run-state-machine.ts";

const QUEUE_FOR_STATUS: Partial<Record<RunStatus, QueueName>> = {
  PLANNING: "plan",
  CODING: "code",
  VALIDATING: "validate",
};

interface StalledRunRow {
  id: string;
  tenantId: string;
  status: RunStatus;
  attempt: number;
  maxAttempts: number;
  updatedAt: Date;
}

interface ReapResult {
  issueId: string;
  next: RunStatus;
  attempt: number;
  outcome: "requeued" | "failed";
}

/**
 * Finds runs stuck in an active stage longer than RUN_STALL_MINUTES and either
 * re-publishes the stage (attempt counted) or fails them. Cross-tenant listing
 * goes through the SECURITY DEFINER helper; mutations stay inside withTenant.
 */
@Injectable()
export class StalledRunReaper {
  private readonly logger = new Logger(StalledRunReaper.name);
  private readonly stallMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(QUEUE_PUBLISHER) private readonly publisher: QueuePublisher,
    private readonly audit: AuditService,
    config: ConfigService,
    @Optional() private readonly metrics?: MetricsService,
  ) {
    this.stallMinutes = config.getOrThrow<number>("RUN_STALL_MINUTES");
  }

  async run(): Promise<{ requeued: number; failed: number }> {
    const cutoff = new Date(Date.now() - this.stallMinutes * 60_000);
    const stalled = await this.listStalled(cutoff, 100);
    let requeued = 0;
    let failed = 0;

    for (const row of stalled) {
      try {
        const outcome = await this.reapOne(row);
        if (outcome === "requeued") {
          requeued += 1;
        } else if (outcome === "failed") {
          failed += 1;
        }
        if (outcome !== "skipped") {
          this.metrics?.recordMaintenance("stalled_run", outcome);
        }
      } catch (error) {
        this.logger.error(
          `failed to reap run ${row.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (stalled.length > 0) {
      this.logger.log(
        `stalled-run reaper: scanned ${stalled.length}, requeued ${requeued}, failed ${failed}`,
      );
    }

    return { requeued, failed };
  }

  private async listStalled(
    cutoff: Date,
    max: number,
  ): Promise<StalledRunRow[]> {
    return this.prisma.client.$queryRaw<StalledRunRow[]>`
      SELECT id, "tenantId", status, attempt, "maxAttempts", "updatedAt"
      FROM codebeast_stalled_runs(${cutoff}::timestamptz, ${max}::int)
    `;
  }

  private async reapOne(
    row: StalledRunRow,
  ): Promise<"requeued" | "failed" | "skipped"> {
    const result = await this.prisma.withTenant(row.tenantId, async (tx) => {
      const current = await tx.run.findUnique({
        where: { id: row.id },
        select: {
          id: true,
          tenantId: true,
          issueId: true,
          status: true,
          attempt: true,
          replans: true,
          maxAttempts: true,
        },
      });

      if (!current) {
        return null;
      }

      const status = current.status as RunStatus;
      if (
        status !== "QUEUED" &&
        status !== "PLANNING" &&
        status !== "CODING" &&
        status !== "VALIDATING"
      ) {
        return null;
      }

      if (status === "QUEUED") {
        const start = beginRun();
        await tx.run.update({
          where: { id: current.id },
          data: {
            status: start.status,
            attempt: start.attempt,
            lastError: "stalled: requeued",
          },
        });
        return {
          issueId: current.issueId,
          next: start.status,
          attempt: start.attempt,
          outcome: "requeued",
        } satisfies ReapResult;
      }

      const state: RunState = {
        status,
        attempt: current.attempt,
        maxAttempts: current.maxAttempts,
        replans: current.replans,
      };

      const decision = decideAfterStage(state, status, "retryable", {
        reason: "stalled",
      });

      await tx.run.update({
        where: { id: current.id },
        data: {
          status: decision.next,
          attempt: decision.attempt,
          replans: decision.replans,
          lastError: decision.reason ?? "stalled",
          ...(decision.next === "FAILED" || decision.next === "ESCALATED"
            ? { finishedAt: new Date() }
            : {}),
        },
      });

      if (decision.next === "FAILED" || decision.next === "ESCALATED") {
        await tx.issue.update({
          where: { id: current.issueId },
          data: {
            status: decision.next === "ESCALATED" ? "ESCALATED" : "FAILED",
          },
        });
        return {
          issueId: current.issueId,
          next: decision.next,
          attempt: decision.attempt,
          outcome: "failed",
        } satisfies ReapResult;
      }

      return {
        issueId: current.issueId,
        next: decision.next,
        attempt: decision.attempt,
        outcome: "requeued",
      } satisfies ReapResult;
    });

    if (!result) {
      return "skipped";
    }

    if (result.outcome === "requeued") {
      const queue = QUEUE_FOR_STATUS[result.next];
      if (queue) {
        await this.publisher.publish(
          queue,
          { tenantId: row.tenantId, runId: row.id },
          {
            jobId: `run-${row.id}-${queue}-${result.attempt}-reap-${Date.now()}`,
          },
        );
      }
    }

    await this.audit.recordSystem({
      tenantId: row.tenantId,
      action:
        result.outcome === "requeued"
          ? "run.stalled.requeue"
          : "run.stalled.fail",
      targetType: "run",
      targetId: row.id,
      metadata: {
        previousStatus: row.status,
        nextStatus: result.next,
        attempt: result.attempt,
        issueId: result.issueId,
      },
    });

    return result.outcome;
  }
}
