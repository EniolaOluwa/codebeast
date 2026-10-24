import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { type WebhookAck, WebhookSourceSchema } from "@repo/types";
import type { FastifyRequest } from "fastify";

import { Public } from "../../common/decorators/public.decorator.ts";
import { WebhookAckDto } from "./dto.ts";
import { WebhooksService } from "./webhooks.service.ts";

interface RawBodyRequest extends FastifyRequest {
  rawBody?: Buffer;
}

@ApiTags("webhooks")
@Public()
@Throttle({ default: { limit: 300, ttl: 60_000 } })
@Controller({ path: "webhooks", version: "1" })
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Post(":source/:integrationId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Receive a provider webhook" })
  @ApiOkResponse({ type: WebhookAckDto })
  handle(
    @Param("source") source: string,
    @Param("integrationId") integrationId: string,
    @Req() request: RawBodyRequest,
  ): Promise<WebhookAck> {
    const parsedSource = WebhookSourceSchema.parse(source);
    const rawBody =
      request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {}));

    return this.webhooks.handle(
      parsedSource,
      integrationId,
      rawBody,
      request.headers,
      (request.body ?? {}) as Record<string, unknown>,
    );
  }
}
