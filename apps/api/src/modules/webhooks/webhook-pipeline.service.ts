import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Prisma } from "@repo/db";
import {
  byteLength,
  MAX_WEBHOOK_RAW_BYTES,
  type NormalizedSignal,
  type Provider,
  type WebhookAccepted,
} from "@repo/types";
import { ZodError } from "zod";

import { CryptoService } from "../../common/crypto/crypto.service.ts";
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
} from "../../common/errors/errors.ts";
import { PrismaService, RLS_CONTEXT } from "../../prisma/prisma.service.ts";
import {
  QUEUE_PUBLISHER,
  type QueuePublisher,
} from "../../queues/queue.types.ts";
import {
  type IntegrationRow,
  IntegrationsService,
} from "../integrations/integrations.service.ts";
import { RuleEngine } from "../rules/rule-engine.service.ts";
import { CorrelationService } from "./correlation.service.ts";
import {
  freshdeskEnvelopeToTicket,
  freshdeskTicketToSignal,
  normalizeGithub,
  normalizeJira,
  normalizeSentry,
  normalizeSlack,
} from "./normalizers.ts";
import { PullRequestSyncService } from "./pull-request-sync.service.ts";
import {
  header,
  type HeaderBag,
  verifyGithub,
  verifySentry,
  verifySharedSecret,
  verifySlack,
} from "./signatures.ts";

export interface WebhookRequest {
  rawBody: string | undefined;
  headers: HeaderBag;
  body: unknown;
  integrationId?: string;
}

interface IngestOutcome {
  duplicate: boolean;
  issueId: string | null;
  signalId: string | null;
  issueCreated: boolean;
  eventId: string;
}

const BYTES_PER_DAY = 86_400_000;

/**
 * The single webhook pipeline all four providers share:
 * resolve integration -> verify signature -> normalize -> dedupe (WebhookEvent)
 * -> correlate into an issue -> enqueue. Cheap rejects happen before any
 * write, and duplicates are decided by one unique index.
 */
@Injectable()
export class WebhookPipelineService {
  private readonly logger = new Logger(WebhookPipelineService.name);
  private readonly rawTtlDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly integrations: IntegrationsService,
    private readonly correlation: CorrelationService,
    private readonly pullRequestSync: PullRequestSyncService,
    private readonly ruleEngine: RuleEngine,
    @Inject(QUEUE_PUBLISHER) private readonly publisher: QueuePublisher,
    config: ConfigService,
  ) {
    this.rawTtlDays = config.getOrThrow<number>("WEBHOOK_RAW_TTL_DAYS");
  }

  async handle(
    provider: Provider,
    request: WebhookRequest,
  ): Promise<WebhookAccepted> {
    if (!request.rawBody) {
      throw new BadRequestError("Missing webhook payload");
    }

    const integration = await this.resolveIntegration(provider, request);
    const secrets = this.integrations.getSecrets(integration);
    this.assertSignature(provider, request, secrets);

    // PR lifecycle events update existing PullRequest rows; they are not
    // signals and must never create reports of their own.
    if (
      provider === "GITHUB" &&
      header(request.headers, "x-github-event") === "pull_request"
    ) {
      return this.handlePullRequestSync(provider, request, integration);
    }

    const signal = this.normalize(provider, request, integration);
    const payloadHash = this.crypto.hash(request.rawBody);
    const deliveryId = this.deliveryId(provider, request);
    // The delivery id keys the *event* (replay dedupe). The signal keeps the
    // normalizer's semantic id (Sentry issue, Jira key, Freshdesk ticket…),
    // so webhook and scan ingestion of the same item dedupe to one signal.
    const eventExternalId = deliveryId ?? `sha256:${payloadHash}`;
    const tenantId = integration.tenantId;

    const outcome = await this.prisma.withTenant(
      tenantId,
      async (tx): Promise<IngestOutcome> => {
        const { event, fresh } = await this.claimEvent(tx, {
          tenantId,
          provider,
          externalId: eventExternalId,
          payloadHash,
          rawBody: request.rawBody!,
        });

        if (!fresh && event.status === "PROCESSED") {
          return {
            duplicate: true,
            issueId: null,
            signalId: null,
            issueCreated: false,
            eventId: event.id,
          };
        }

        // Fresh delivery — or a retry of one that never finished.
        const correlated = await this.correlation.correlate(
          tx,
          tenantId,
          signal,
        );

        await tx.webhookEvent.update({
          where: { id: event.id },
          data: {
            tenantId,
            status: "PROCESSED",
            processedAt: new Date(),
            error: null,
          },
        });

        return {
          duplicate: false,
          issueId: correlated.issueId,
          signalId: correlated.signalId,
          issueCreated: correlated.issueCreated,
          eventId: event.id,
        };
      },
    );

    if (!outcome.duplicate && outcome.issueId) {
      // Detection rules gate brand-new reports (design.md §8.5).
      if (outcome.issueCreated) {
        const detection = await this.ruleEngine.evaluateDetection(tenantId, {
          providers: [signal.provider],
          signalCount: 1,
          title: signal.title,
        });

        if (detection.action === "IGNORE") {
          await this.markIgnored(tenantId, outcome.issueId);

          this.logger.log(
            `detection rule ${detection.ruleId} ignored issue ${outcome.issueId}`,
          );

          return {
            accepted: true,
            duplicate: false,
            issueId: outcome.issueId,
          };
        }
      }

      await this.enqueue(tenantId, outcome);
    }

    return {
      accepted: true,
      duplicate: outcome.duplicate,
      ...(outcome.issueId ? { issueId: outcome.issueId } : {}),
    };
  }

  private async markIgnored(tenantId: string, issueId: string): Promise<void> {
    await this.prisma.withTenant(tenantId, async (tx) => {
      await tx.issue.update({
        where: { id: issueId },
        data: { status: "IGNORED" },
      });
    });
  }

  private async handlePullRequestSync(
    provider: Provider,
    request: WebhookRequest,
    integration: IntegrationRow,
  ): Promise<WebhookAccepted> {
    const tenantId = integration.tenantId;
    const payloadHash = this.crypto.hash(request.rawBody!);
    const externalId =
      this.deliveryId(provider, request) ?? `sha256:${payloadHash}`;

    const claimed = await this.prisma.withTenant(tenantId, async (tx) => {
      const claim = await this.claimEvent(tx, {
        tenantId,
        provider,
        externalId,
        payloadHash,
        rawBody: request.rawBody!,
      });

      if (!claim.fresh && claim.event.status === "PROCESSED") {
        return { duplicate: true, eventId: claim.event.id };
      }

      return { duplicate: false, eventId: claim.event.id };
    });

    if (!claimed.duplicate) {
      const sync = await this.pullRequestSync.sync(tenantId, request.body);

      if (sync.handled && sync.updated) {
        this.logger.log(
          `pull request state synced from delivery ${externalId}`,
        );
      }

      await this.prisma.withTenant(tenantId, async (tx) => {
        await tx.webhookEvent.update({
          where: { id: claimed.eventId },
          data: {
            tenantId,
            status: "PROCESSED",
            processedAt: new Date(),
            error: null,
          },
        });
      });
    }

    return { accepted: true, duplicate: claimed.duplicate };
  }

  private async enqueue(
    tenantId: string,
    outcome: IngestOutcome,
  ): Promise<void> {
    try {
      await this.publisher.publish("ingest", {
        tenantId,
        issueId: outcome.issueId!,
        ...(outcome.signalId ? { signalId: outcome.signalId } : {}),
      });
    } catch (error) {
      await this.prisma.withTenant(tenantId, async (tx) => {
        await tx.webhookEvent.update({
          where: { id: outcome.eventId },
          data: {
            status: "FAILED",
            error: error instanceof Error ? error.message : "publish failed",
          },
        });
      });
      throw error;
    }
  }

  private async resolveIntegration(
    provider: Provider,
    request: WebhookRequest,
  ): Promise<IntegrationRow> {
    const body = (request.body ?? {}) as Record<string, unknown>;

    switch (provider) {
      case "SLACK": {
        const teamId = body.team_id;
        return this.requireByExternalId(
          "SLACK",
          typeof teamId === "string" ? teamId : null,
        );
      }
      case "SENTRY": {
        const installation = body.installation as
          { uuid?: unknown } | undefined;
        return this.requireByExternalId(
          "SENTRY",
          typeof installation?.uuid === "string" ? installation.uuid : null,
        );
      }
      case "GITHUB": {
        const installation = body.installation as { id?: unknown } | undefined;
        return this.requireByExternalId(
          "GITHUB",
          typeof installation?.id === "number" ? String(installation.id) : null,
        );
      }
      case "JIRA":
      case "FRESHDESK": {
        // No tenant hint in the payload: the integration id travels in the
        // webhook path (or an explicit header).
        const id =
          request.integrationId ??
          header(request.headers, "x-codebeast-integration-id");

        if (!id) {
          throw new NotFoundError("Integration");
        }

        const integration = await this.prisma.withRls(
          { [RLS_CONTEXT.INTEGRATION_ID]: id },
          (tx) =>
            tx.integration.findFirst({
              where: { id, type: provider, enabled: true },
            }),
        );

        if (!integration) {
          throw new NotFoundError("Integration");
        }

        return integration;
      }
      default:
        throw new BadRequestError(`${provider} does not send webhooks`);
    }
  }

  private async requireByExternalId(
    provider: Provider,
    externalId: string | null,
  ): Promise<IntegrationRow> {
    if (!externalId) {
      throw new NotFoundError("Integration");
    }

    const integration = await this.prisma.withRls(
      { [RLS_CONTEXT.INTEGRATION_EXTERNAL_ID]: externalId },
      (tx) =>
        tx.integration.findFirst({
          where: { type: provider, externalId, enabled: true },
        }),
    );

    if (!integration) {
      throw new NotFoundError("Integration");
    }

    return integration;
  }

  private assertSignature(
    provider: Provider,
    request: WebhookRequest,
    secrets: Record<string, string>,
  ): void {
    const rawBody = request.rawBody!;

    const accepted = ((): boolean => {
      switch (provider) {
        case "SLACK": {
          const secret = secrets.signingSecret;
          return (
            typeof secret === "string" &&
            secret.length > 0 &&
            verifySlack(rawBody, request.headers, secret)
          );
        }
        case "SENTRY": {
          const secret = secrets.signingSecret;
          return (
            typeof secret === "string" &&
            secret.length > 0 &&
            verifySentry(rawBody, request.headers, secret)
          );
        }
        case "GITHUB": {
          const secret = secrets.signingSecret;
          return (
            typeof secret === "string" &&
            secret.length > 0 &&
            verifyGithub(rawBody, request.headers, secret)
          );
        }
        case "JIRA":
        case "FRESHDESK":
          return verifySharedSecret(
            header(request.headers, "x-codebeast-secret"),
            secrets.webhookSecret ?? "",
          );
        default:
          return false;
      }
    })();

    if (!accepted) {
      throw new UnauthorizedError("Invalid or missing webhook signature");
    }
  }

  private normalize(
    provider: Provider,
    request: WebhookRequest,
    integration: IntegrationRow,
  ): NormalizedSignal {
    try {
      switch (provider) {
        case "SLACK":
          return normalizeSlack(request.body);
        case "SENTRY":
          return normalizeSentry(request.body);
        case "GITHUB":
          return normalizeGithub(
            request.body,
            header(request.headers, "x-github-event") ?? null,
          );
        case "JIRA":
          return normalizeJira(request.body);
        case "DISCORD":
          // Discord is scan-only; nothing pushes messages to this endpoint.
          throw new BadRequestError("Discord does not send webhooks");
        case "FRESHDESK": {
          const ticket = freshdeskEnvelopeToTicket(request.body);
          const domain = (integration.config as { domain?: string } | null)
            ?.domain;

          if (!ticket || !domain) {
            throw new BadRequestError(
              "Malformed FRESHDESK webhook payload (missing ticket or domain)",
            );
          }

          return freshdeskTicketToSignal(ticket, { domain });
        }
        default:
          throw new BadRequestError(`Unsupported provider ${provider}`);
      }
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestError(`Malformed ${provider} webhook payload`);
      }
      throw error;
    }
  }

  private deliveryId(
    provider: Provider,
    request: WebhookRequest,
  ): string | null {
    switch (provider) {
      case "SLACK": {
        const eventId = (request.body as { event_id?: unknown }).event_id;
        return typeof eventId === "string" ? eventId : null;
      }
      case "GITHUB":
        return header(request.headers, "x-github-delivery") ?? null;
      case "SENTRY":
      case "JIRA":
      case "FRESHDESK":
      case "DISCORD":
        // No delivery id header: byte-identical retries dedupe by payload hash.
        return null;
    }
  }

  private async claimEvent(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      provider: Provider;
      externalId: string;
      payloadHash: string;
      rawBody: string;
    },
  ): Promise<{
    event: { id: string; status: string };
    fresh: boolean;
  }> {
    const prepared = this.prepareRawPayload(input.rawBody, input.payloadHash);

    // ON CONFLICT DO NOTHING instead of create+catch: a caught unique
    // violation would leave the Postgres transaction aborted (25P02).
    const inserted = await tx.webhookEvent.createMany({
      data: [
        {
          tenantId: input.tenantId,
          provider: input.provider,
          externalId: input.externalId,
          payloadHash: input.payloadHash,
          rawPayload: prepared.value,
          rawPayloadExpiresAt: new Date(
            Date.now() + this.rawTtlDays * BYTES_PER_DAY,
          ),
          truncated: prepared.truncated,
          status: "RECEIVED",
        },
      ],
      skipDuplicates: true,
    });

    const event = await tx.webhookEvent.findUnique({
      where: {
        provider_externalId: {
          provider: input.provider,
          externalId: input.externalId,
        },
      },
      select: { id: true, status: true },
    });

    if (!event) {
      throw new Error("Webhook event vanished after claim");
    }

    return { event, fresh: inserted.count === 1 };
  }

  private prepareRawPayload(
    rawBody: string,
    payloadHash: string,
  ): { value: Prisma.InputJsonValue; truncated: boolean } {
    if (byteLength(rawBody) <= MAX_WEBHOOK_RAW_BYTES) {
      try {
        return {
          value: JSON.parse(rawBody) as Prisma.InputJsonValue,
          truncated: false,
        };
      } catch {
        return { value: { _raw: rawBody }, truncated: false };
      }
    }

    return {
      value: {
        _truncated: true,
        sha256: payloadHash,
        bytes: byteLength(rawBody),
      },
      truncated: true,
    };
  }
}
