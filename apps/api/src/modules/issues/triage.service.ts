import { Injectable, Logger } from "@nestjs/common";
import type { IssueSeverity, NormalizedSignal, SignalKind } from "@repo/types";

import { PrismaService, type TenantDb } from "../../prisma/prisma.service.ts";

export interface TriageInput {
  tenantId: string;
  repositoryId: string | null;
  signal: NormalizedSignal;
}

@Injectable()
export class TriageService {
  private readonly logger = new Logger(TriageService.name);

  constructor(private readonly prisma: PrismaService) {}

  async ingest(
    input: TriageInput,
  ): Promise<{ issueId: string; created: boolean }> {
    const { tenantId, signal } = input;

    return this.prisma.withTenantId(tenantId, async (tx) => {
      const repositoryId =
        input.repositoryId ??
        (await this.resolveRepositoryId(tx, tenantId, signal));

      const existing = await this.findExistingIssue(tx, tenantId, signal);

      const issue =
        existing ??
        (await tx.issue.create({
          data: {
            tenantId,
            repositoryId,
            title: signal.title ?? "Untitled issue",
            summary: signal.body,
            severity: (signal.severity ?? "MEDIUM") as IssueSeverity,
            primarySignal: signal.kind as SignalKind,
            sentryIssueId:
              signal.kind === "SENTRY_EVENT" ? signal.fingerprint : null,
            jiraKey: signal.kind === "JIRA_TICKET" ? signal.externalId : null,
            firstSeenAt: signal.occurredAt,
            lastSeenAt: signal.occurredAt,
          },
        }));

      await tx.issueSignal.upsert({
        where: {
          tenantId_kind_externalId: {
            tenantId,
            kind: signal.kind,
            externalId: signal.externalId,
          },
        },
        create: {
          tenantId,
          issueId: issue.id,
          kind: signal.kind,
          externalId: signal.externalId,
          source: signal.kind,
          title: signal.title,
          body: signal.body,
          url: signal.url,
          metadata: {
            ...signal.metadata,
            ...(signal.stack ? { stack: signal.stack } : {}),
            ...(signal.fingerprint ? { fingerprint: signal.fingerprint } : {}),
          },
          occurredAt: signal.occurredAt,
        },
        update: {
          issueId: issue.id,
          title: signal.title,
          body: signal.body,
          url: signal.url,
        },
      });

      await tx.issue.update({
        where: { id: issue.id },
        data: { lastSeenAt: signal.occurredAt },
      });

      const created = existing === null;
      if (created) {
        this.logger.log(`Triaged new issue=${issue.id} source=${signal.kind}`);
      }

      return { issueId: issue.id, created };
    });
  }

  private async resolveRepositoryId(
    tx: TenantDb,
    tenantId: string,
    signal: NormalizedSignal,
  ): Promise<string | null> {
    if (signal.repositoryFullName) {
      const match = await tx.repository.findFirst({
        where: { tenantId, fullName: signal.repositoryFullName },
      });
      if (match) {
        return match.id;
      }
    }
    const fallback = await tx.repository.findFirst({
      where: { tenantId, isActive: true },
    });
    return fallback?.id ?? null;
  }

  private async findExistingIssue(
    tx: TenantDb,
    tenantId: string,
    signal: NormalizedSignal,
  ) {
    if (signal.kind === "SENTRY_EVENT" && signal.fingerprint) {
      return tx.issue.findFirst({
        where: { tenantId, sentryIssueId: signal.fingerprint },
      });
    }
    if (signal.kind === "JIRA_TICKET") {
      return tx.issue.findFirst({
        where: { tenantId, jiraKey: signal.externalId },
      });
    }
    return null;
  }
}
