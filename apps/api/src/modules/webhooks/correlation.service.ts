import { Injectable } from "@nestjs/common";
import type { Prisma } from "@repo/db";
import {
  MAX_ISSUE_SUMMARY_BYTES,
  MAX_SIGNAL_BODY_BYTES,
  type NormalizedSignal,
  truncateToBytes,
} from "@repo/types";

import { CryptoService } from "../../common/crypto/crypto.service.ts";

/**
 * Signals → issues. Signals with the same correlation key land on the same
 * open issue within the window (Sentry alert + Slack message referencing it +
 * GitHub issue are one problem). Runs inside the caller's transaction.
 */

export const CORRELATION_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface CorrelationResult {
  issueId: string;
  signalId: string | null;
  issueCreated: boolean;
  signalAttached: boolean;
}

@Injectable()
export class CorrelationService {
  constructor(private readonly crypto: CryptoService) {}

  async correlate(
    tx: Prisma.TransactionClient,
    tenantId: string,
    signal: NormalizedSignal,
  ): Promise<CorrelationResult> {
    const now = new Date();

    let issue = await tx.issue.findFirst({
      where: {
        tenantId,
        correlationKey: signal.correlationKey,
        status: { notIn: ["RESOLVED", "IGNORED"] },
        lastSeenAt: {
          gte: new Date(now.getTime() - CORRELATION_WINDOW_MS),
        },
      },
      orderBy: { lastSeenAt: "desc" },
      select: { id: true },
    });

    const issueCreated = issue === null;

    if (!issue) {
      const repository = signal.repositoryHint
        ? await tx.repository.findFirst({
            where: { tenantId, fullName: signal.repositoryHint },
            select: { id: true },
          })
        : null;

      issue = await tx.issue.create({
        data: {
          tenantId,
          title: signal.title,
          summary: truncateToBytes(signal.body, MAX_ISSUE_SUMMARY_BYTES),
          correlationKey: signal.correlationKey,
          repositoryId: repository?.id ?? null,
          firstSeenAt: new Date(signal.occurredAt),
          lastSeenAt: now,
        },
        select: { id: true },
      });
    }

    const issueId = issue.id;

    // ON CONFLICT DO NOTHING: replayed deliveries must not abort the
    // surrounding transaction the way a caught unique violation would.
    const inserted = await tx.issueSignal.createMany({
      data: [
        {
          tenantId,
          issueId,
          provider: signal.provider,
          externalId: signal.externalId,
          eventType: signal.eventType,
          title: signal.title,
          body: truncateToBytes(signal.body, MAX_SIGNAL_BODY_BYTES),
          contentHash: this.crypto.hash(
            `${signal.provider}:${signal.externalId}:${signal.title}:${signal.body}`,
          ),
          url: signal.url,
          actor: signal.actor,
          occurredAt: new Date(signal.occurredAt),
        },
      ],
      skipDuplicates: true,
    });

    const signalId =
      (
        await tx.issueSignal.findUnique({
          where: {
            tenantId_provider_externalId: {
              tenantId,
              provider: signal.provider,
              externalId: signal.externalId,
            },
          },
          select: { id: true },
        })
      )?.id ?? null;

    if (inserted.count === 1) {
      await tx.issue.update({
        where: { id: issueId },
        data: {
          lastSeenAt: now,
          signalCount: { increment: 1 },
          // Empty snapshot marks the cached context stale.
          snapshot: {},
        },
      });
    }

    return {
      issueId,
      signalId,
      issueCreated,
      signalAttached: inserted.count === 1,
    };
  }
}
