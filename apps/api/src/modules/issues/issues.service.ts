import { Inject, Injectable } from "@nestjs/common";
import type { IssueStatus, PaginatedResponse, Provider } from "@repo/types";

import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../common/errors/errors.ts";
import { paginated, skipTake } from "../../common/pagination.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";
import {
  QUEUE_PUBLISHER,
  type QueuePublisher,
} from "../../queues/queue.types.ts";
import { RunOrchestrator } from "../runs/run-orchestrator.service.ts";
import { TERMINAL_RUN_STATUSES } from "../runs/run-state-machine.ts";

export interface IssueView {
  id: string;
  title: string;
  status: IssueStatus;
  correlationKey: string;
  signalCount: number;
  repository: { fullName: string; defaultBranch: string } | null;
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
}

export interface IssueSignalView {
  id: string;
  provider: Provider;
  eventType: string;
  title: string;
  body: string;
  url: string | null;
  actor: string | null;
  occurredAt: string;
}

export interface IssueDetailView extends IssueView {
  summary: string;
  signals: IssueSignalView[];
}

interface IssueRow {
  id: string;
  title: string;
  status: IssueStatus;
  correlationKey: string;
  signalCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  createdAt: Date;
  repository: { fullName: string; defaultBranch: string } | null;
}

function toIssueView(row: IssueRow): IssueView {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    correlationKey: row.correlationKey,
    signalCount: row.signalCount,
    repository: row.repository,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

const REPOSITORY_SELECT = {
  select: { fullName: true, defaultBranch: true },
} as const;

@Injectable()
export class IssuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: RunOrchestrator,
    @Inject(QUEUE_PUBLISHER) private readonly publisher: QueuePublisher,
  ) {}

  async list(
    tenantId: string,
    page: number,
    limit: number,
    status?: IssueStatus,
  ): Promise<PaginatedResponse<IssueView>> {
    const { skip, take } = skipTake(page, limit);
    const where = { tenantId, ...(status ? { status } : {}) };

    const [rows, total] = await this.prisma.withTenant(tenantId, (tx) =>
      Promise.all([
        tx.issue.findMany({
          where,
          orderBy: { lastSeenAt: "desc" },
          skip,
          take,
          include: { repository: REPOSITORY_SELECT },
        }),
        tx.issue.count({ where }),
      ]),
    );

    return paginated(rows.map(toIssueView), page, limit, total);
  }

  async get(tenantId: string, id: string): Promise<IssueDetailView> {
    const row = await this.prisma.withTenant(tenantId, (tx) =>
      tx.issue.findFirst({
        where: { id, tenantId },
        include: {
          repository: REPOSITORY_SELECT,
          signals: { orderBy: { occurredAt: "asc" } },
        },
      }),
    );

    if (!row) {
      throw new NotFoundError("Issue");
    }

    return {
      ...toIssueView(row),
      summary: row.summary,
      signals: row.signals.map((signal) => ({
        id: signal.id,
        provider: signal.provider,
        eventType: signal.eventType,
        title: signal.title,
        body: signal.body,
        url: signal.url,
        actor: signal.actor,
        occurredAt: signal.occurredAt.toISOString(),
      })),
    };
  }

  /** Re-runs the pipeline for a finished issue (fresh run, attempts reset). */
  async retry(tenantId: string, issueId: string): Promise<IssueDetailView> {
    const issue = await this.loadIssue(tenantId, issueId);

    if (!["FAILED", "ESCALATED", "IGNORED"].includes(issue.status)) {
      throw new ValidationError(
        `Only failed, escalated or ignored reports can be retried (current: ${issue.status})`,
      );
    }

    const open = await this.prisma.withTenant(tenantId, (tx) =>
      tx.run.findFirst({
        where: {
          issueId,
          status: { notIn: [...TERMINAL_RUN_STATUSES] },
        },
        select: { id: true },
      }),
    );

    if (open) {
      throw new ConflictError("A run is already in progress for this report");
    }

    await this.orchestrator.startRun(tenantId, issueId);
    return this.get(tenantId, issueId);
  }

  /** Ignores the report and cancels any in-flight run. */
  async ignore(tenantId: string, issueId: string): Promise<IssueDetailView> {
    const issue = await this.loadIssue(tenantId, issueId);

    if (issue.status === "RESOLVED") {
      throw new ValidationError("Resolved reports cannot be ignored");
    }

    await this.prisma.withTenant(tenantId, async (tx) => {
      // Pending stage jobs become no-ops: the orchestrator guards on status.
      await tx.run.updateMany({
        where: { issueId, status: { notIn: [...TERMINAL_RUN_STATUSES] } },
        data: { status: "CANCELLED", finishedAt: new Date() },
      });

      await tx.issue.update({
        where: { id: issueId },
        data: { status: "IGNORED" },
      });
    });

    return this.get(tenantId, issueId);
  }

  /** Human closes the loop: the fix shipped, mark it resolved. */
  async approve(tenantId: string, issueId: string): Promise<IssueDetailView> {
    const issue = await this.loadIssue(tenantId, issueId);

    if (issue.status !== "PR_OPENED") {
      throw new ValidationError(
        `Only reports with an open pull request can be approved (current: ${issue.status})`,
      );
    }

    await this.prisma.withTenant(tenantId, async (tx) => {
      await tx.issue.update({
        where: { id: issueId },
        data: { status: "RESOLVED", resolvedAt: new Date() },
      });
    });

    return this.get(tenantId, issueId);
  }

  /** Ship step: opens the pull request for a READY issue via the pr queue. */
  async shipPr(tenantId: string, issueId: string): Promise<{ accepted: true }> {
    const issue = await this.loadIssue(tenantId, issueId);

    if (issue.status !== "READY") {
      throw new ValidationError(
        `Only ready reports can be shipped (current: ${issue.status})`,
      );
    }

    await this.publisher.publish(
      "pr",
      { tenantId, issueId },
      { jobId: `ship-${issueId}-pr` },
    );

    return { accepted: true };
  }

  private async loadIssue(
    tenantId: string,
    issueId: string,
  ): Promise<{ id: string; status: IssueStatus }> {
    const issue = await this.prisma.withTenant(tenantId, (tx) =>
      tx.issue.findFirst({
        where: { id: issueId, tenantId },
        select: { id: true, status: true },
      }),
    );

    if (!issue) {
      throw new NotFoundError("Issue");
    }

    return issue;
  }
}
