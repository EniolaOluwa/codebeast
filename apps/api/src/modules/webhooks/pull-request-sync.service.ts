import { Injectable } from "@nestjs/common";
import { githubEnvelopeSchema } from "@repo/types";

import { PrismaService } from "../../prisma/prisma.service.ts";

/**
 * Pull-request lifecycle events (opened/closed/merged on GitHub) must update
 * our `PullRequest` rows instead of being ingested as new signals.
 */
@Injectable()
export class PullRequestSyncService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns `{ handled: true }` for any pull_request event (so ingestion is
   * skipped even when there is nothing to update — e.g. PRs from other tools).
   */
  async sync(
    tenantId: string,
    payload: unknown,
  ): Promise<{ handled: boolean; updated: boolean }> {
    const envelope = githubEnvelopeSchema.safeParse(payload);

    if (!envelope.success || !envelope.data.pull_request) {
      return { handled: false, updated: false };
    }

    const { action, pull_request: pullRequest, repository } = envelope.data;
    const number = pullRequest.number;
    const fullName = repository?.full_name;

    if (!number || !fullName) {
      return { handled: true, updated: false };
    }

    const status = resolveStatus(action, pullRequest.merged);

    if (!status) {
      return { handled: true, updated: false };
    }

    const updated = await this.prisma.withTenant(tenantId, async (tx) => {
      const repo = await tx.repository.findFirst({
        where: { tenantId, fullName },
        select: { id: true },
      });

      if (!repo) {
        return 0;
      }

      const result = await tx.pullRequest.updateMany({
        where: { repositoryId: repo.id, number },
        data: { status },
      });

      return result.count;
    });

    return { handled: true, updated: updated > 0 };
  }
}

function resolveStatus(
  action: string | null | undefined,
  merged: boolean | null | undefined,
): "MERGED" | "CLOSED" | "OPEN" | null {
  if (action === "closed") {
    return merged ? "MERGED" : "CLOSED";
  }

  if (action === "reopened") {
    return "OPEN";
  }

  return null;
}
