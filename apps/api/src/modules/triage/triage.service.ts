import { Injectable } from "@nestjs/common";
import type { Prisma } from "@repo/db";
import {
  type IssueContext,
  issueContextSchema,
  MAX_CONTEXT_SIGNALS,
  MAX_ISSUE_SUMMARY_BYTES,
  MAX_SIGNAL_BODY_BYTES,
  truncateToBytes,
} from "@repo/types";

import { NotFoundError } from "../../common/errors/errors.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";
import { mergeStackFrames } from "../webhooks/stack-frames.ts";
import { EnrichmentService } from "./enrichment.service.ts";

/**
 * Builds the bounded `issueContext` the agent pipeline consumes. The result is
 * cached on the issue row; a new signal clears the cache. Enrichers run at
 * most once per snapshot — retries reuse the snapshot instead of re-fetching.
 */
@Injectable()
export class TriageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly enrichment: EnrichmentService,
  ) {}

  async buildIssueContext(
    tenantId: string,
    issueId: string,
  ): Promise<IssueContext> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const issue = await tx.issue.findUnique({
        where: { id: issueId },
        include: {
          repository: { select: { fullName: true, defaultBranch: true } },
          signals: {
            orderBy: { occurredAt: "desc" },
            take: MAX_CONTEXT_SIGNALS,
          },
        },
      });

      if (!issue) {
        throw new NotFoundError("Issue");
      }

      const cached = issueContextSchema.safeParse(issue.snapshot);

      if (cached.success) {
        return cached.data;
      }

      const enrichment = await this.enrichment.enrich(
        tenantId,
        issue.signals.map((signal) => ({
          provider: signal.provider,
          externalId: signal.externalId,
          url: signal.url,
        })),
      );

      const context = issueContextSchema.parse({
        issueId: issue.id,
        title: issue.title,
        summary: truncateToBytes(issue.summary, MAX_ISSUE_SUMMARY_BYTES),
        repository: issue.repository
          ? {
              fullName: issue.repository.fullName,
              defaultBranch: issue.repository.defaultBranch,
            }
          : null,
        signals: issue.signals.map((signal) => ({
          id: signal.id,
          provider: signal.provider,
          eventType: signal.eventType,
          title: signal.title,
          body: truncateToBytes(signal.body, MAX_SIGNAL_BODY_BYTES),
          url: signal.url,
          actor: signal.actor,
          occurredAt: signal.occurredAt.toISOString(),
        })),
        topFrames: mergeStackFrames(issue.signals.map((signal) => signal.body)),
        enrichment,
      });

      await tx.issue.update({
        where: { id: issue.id },
        // The context is JSON-safe by construction (bounded strings, plain
        // records); Prisma's Json input type cannot infer that.
        data: { snapshot: context as unknown as Prisma.InputJsonValue },
      });

      return context;
    });
  }
}
