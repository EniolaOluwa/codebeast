import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { WebhookAccepted } from "@repo/types";
import type { FastifyRequest } from "fastify";

import { Public } from "../../common/auth/decorators.ts";
import {
  WebhookPipelineService,
  type WebhookRequest,
} from "./webhook-pipeline.service.ts";

function toWebhookRequest(
  request: FastifyRequest,
  integrationId?: string,
): WebhookRequest {
  return {
    rawBody: request.rawBody,
    headers: request.headers as Record<string, string | string[] | undefined>,
    body: request.body,
    ...(integrationId ? { integrationId } : {}),
  };
}

@ApiTags("webhooks")
@Public()
@Controller("webhooks")
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class WebhooksController {
  constructor(private readonly pipeline: WebhookPipelineService) {}

  @Post("slack")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: "Slack Events API callback (v0 signature)" })
  slack(@Req() request: FastifyRequest): Promise<WebhookAccepted> {
    return this.pipeline.handle("SLACK", toWebhookRequest(request));
  }

  @Post("sentry")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: "Sentry issue alert webhook (HMAC signature)" })
  sentry(@Req() request: FastifyRequest): Promise<WebhookAccepted> {
    return this.pipeline.handle("SENTRY", toWebhookRequest(request));
  }

  @Post("github")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: "GitHub App webhook (X-Hub-Signature-256)" })
  github(@Req() request: FastifyRequest): Promise<WebhookAccepted> {
    return this.pipeline.handle("GITHUB", toWebhookRequest(request));
  }

  @Post("jira/:integrationId")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: "Jira webhook (shared-secret header X-CodeBeast-Secret)",
  })
  jira(
    @Req() request: FastifyRequest,
    @Param("integrationId") integrationId: string,
  ): Promise<WebhookAccepted> {
    return this.pipeline.handle(
      "JIRA",
      toWebhookRequest(request, integrationId),
    );
  }

  @Post("freshdesk/:integrationId")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary:
      "Freshdesk conversation webhook (shared-secret header X-CodeBeast-Secret)",
  })
  freshdesk(
    @Req() request: FastifyRequest,
    @Param("integrationId") integrationId: string,
  ): Promise<WebhookAccepted> {
    return this.pipeline.handle(
      "FRESHDESK",
      toWebhookRequest(request, integrationId),
    );
  }
}
