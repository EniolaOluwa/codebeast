import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@repo/db";
import type { WebhookAck, WebhookSource } from "@repo/types";

import { NotFoundError } from "../../common/errors/errors.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";
import { IntegrationsService } from "../integrations/integrations.service.ts";
import { TriageService } from "../issues/triage.service.ts";
import { RunService } from "../runs/run.service.ts";
import { WebhookNormalizer } from "./webhook-normalizer.ts";
import { WebhookSignatureService } from "./webhook-signature.service.ts";

type HeaderMap = Record<string, string | string[] | undefined>;

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
    private readonly signatures: WebhookSignatureService,
    private readonly normalizer: WebhookNormalizer,
    private readonly triage: TriageService,
    private readonly runs: RunService,
  ) {}

  async handle(
    source: WebhookSource,
    integrationId: string,
    rawBody: Buffer,
    headers: HeaderMap,
    payload: Record<string, unknown>,
  ): Promise<WebhookAck> {
    const integration =
      await this.integrations.resolveWithSecret(integrationId);

    if (!integration || integration.type !== source) {
      throw new NotFoundError("Integration");
    }

    this.signatures.verify(source, integration.secret, rawBody, headers);

    const normalized = this.normalizer.normalize(source, payload);

    try {
      const event = await this.prisma.client.webhookEvent.create({
        data: {
          tenantId: integration.tenantId,
          integrationId: integration.id,
          source,
          externalId: normalized.externalId,
          signatureValid: true,
          payload: payload as Prisma.InputJsonValue,
        },
      });

      if (!normalized.signal) {
        await this.handleGithubPr(integration.tenantId, payload);
        await this.completeEvent(source, normalized.externalId, "IGNORED");
        return {
          received: true,
          duplicate: false,
          webhookEventId: event.id,
        };
      }

      const { issueId, created } = await this.triage.ingest({
        tenantId: integration.tenantId,
        repositoryId: integration.repositoryId,
        signal: normalized.signal,
      });

      if (created) {
        const hasRepository = await this.prisma.withTenantId(
          integration.tenantId,
          async (tx) => {
            const issue = await tx.issue.findUnique({ where: { id: issueId } });
            return Boolean(issue?.repositoryId);
          },
        );
        if (hasRepository) {
          await this.runs.startForTenant(integration.tenantId, issueId);
        }
      }

      await this.completeEvent(source, normalized.externalId, "PROCESSED");
      this.logger.log(
        `Webhook ${source} processed integration=${integrationId} issue=${issueId}`,
      );

      return {
        received: true,
        duplicate: false,
        webhookEventId: event.id,
      };
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        return {
          received: false,
          duplicate: true,
          webhookEventId: null,
        };
      }
      throw error;
    }
  }

  private async handleGithubPr(
    tenantId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const pull = payload.pull_request as
      { number?: number; merged?: boolean; state?: string } | undefined;
    const repo = payload.repository as { full_name?: string } | undefined;

    if (!pull?.number || !repo?.full_name) {
      return;
    }

    const status = pull.merged
      ? "MERGED"
      : pull.state === "closed"
        ? "CLOSED"
        : "OPEN";

    await this.prisma.withTenantId(tenantId, async (tx) => {
      const record = await tx.pullRequest.findFirst({
        where: {
          externalNumber: pull.number,
          repository: { fullName: repo.full_name },
        },
      });
      if (!record) {
        return;
      }
      await tx.pullRequest.update({
        where: { id: record.id },
        data: { status },
      });
      if (status === "MERGED") {
        await tx.issue.update({
          where: { id: record.issueId },
          data: { status: "RESOLVED", resolvedAt: new Date() },
        });
      }
    });
  }

  private async completeEvent(
    source: WebhookSource,
    externalId: string,
    status: "PROCESSED" | "IGNORED" | "FAILED",
  ): Promise<void> {
    await this.prisma.client.webhookEvent.update({
      where: { source_externalId: { source, externalId } },
      data: { status, processedAt: new Date() },
    });
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    );
  }
}
