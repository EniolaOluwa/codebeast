import { Injectable } from "@nestjs/common";
import type { IssueStatus, PaginatedResponse, Provider } from "@repo/types";

import { NotFoundError } from "../../common/errors/errors.ts";
import { paginated, skipTake } from "../../common/pagination.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";

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
  constructor(private readonly prisma: PrismaService) {}

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
}
