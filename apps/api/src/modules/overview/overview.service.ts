import { Injectable } from "@nestjs/common";
import type { Provider } from "@repo/types";

import { PrismaService } from "../../prisma/prisma.service.ts";
import { type IssueView, toIssueView } from "../issues/issues.service.ts";

export interface OverviewSourceView {
  integrationId: string;
  type: Provider;
  name: string;
  enabled: boolean;
  lastSeenAt: string | null;
  healthy: boolean;
}

export interface OverviewView {
  windowDays: number;
  reportsFound: number;
  ticketsCreated: number;
  prsOpened: number;
  prsMerged: number;
  needsReview: IssueView[];
  sources: OverviewSourceView[];
}

const WINDOW_DAYS = 7;
const MS_PER_DAY = 86_400_000;

/** Dashboard aggregates for the Overview page (design.md §8.1). */
@Injectable()
export class OverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async get(tenantId: string): Promise<OverviewView> {
    const since = new Date(Date.now() - WINDOW_DAYS * MS_PER_DAY);

    return this.prisma.withTenant(tenantId, async (tx) => {
      const [
        reportsFound,
        ticketsCreated,
        prsOpened,
        prsMerged,
        needsReview,
        integrations,
        signalGroups,
      ] = await Promise.all([
        tx.issue.count({ where: { tenantId, createdAt: { gte: since } } }),
        tx.ticket.count({ where: { tenantId, createdAt: { gte: since } } }),
        tx.pullRequest.count({
          where: { tenantId, createdAt: { gte: since } },
        }),
        tx.pullRequest.count({
          where: { tenantId, status: "MERGED", createdAt: { gte: since } },
        }),
        tx.issue.findMany({
          where: {
            tenantId,
            status: { in: ["READY", "ESCALATED"] },
          },
          orderBy: { lastSeenAt: "desc" },
          take: 5,
          include: {
            repository: { select: { fullName: true, defaultBranch: true } },
            ticket: true,
            signals: {
              select: { provider: true },
              orderBy: { occurredAt: "desc" },
              take: 3,
            },
          },
        }),
        tx.integration.findMany({
          where: { tenantId },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            type: true,
            name: true,
            enabled: true,
          },
        }),
        tx.issueSignal.groupBy({
          by: ["provider"],
          where: { tenantId },
          _max: { occurredAt: true },
        }),
      ]);

      const lastSeenByProvider = new Map(
        signalGroups.map((group) => [group.provider, group._max.occurredAt]),
      );

      return {
        windowDays: WINDOW_DAYS,
        reportsFound,
        ticketsCreated,
        prsOpened,
        prsMerged,
        needsReview: needsReview.map(toIssueView),
        sources: integrations.map((integration) => ({
          integrationId: integration.id,
          type: integration.type,
          name: integration.name,
          enabled: integration.enabled,
          lastSeenAt:
            lastSeenByProvider.get(integration.type)?.toISOString() ?? null,
          healthy: integration.enabled,
        })),
      };
    });
  }
}
