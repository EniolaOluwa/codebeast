import { Module } from "@nestjs/common";

import { IntegrationsModule } from "../integrations/integrations.module.ts";
import { IssuesModule } from "../issues/issues.module.ts";
import { RunsModule } from "../runs/runs.module.ts";
import { WebhookNormalizer } from "./webhook-normalizer.ts";
import { WebhookSignatureService } from "./webhook-signature.service.ts";
import { WebhooksController } from "./webhooks.controller.ts";
import { WebhooksService } from "./webhooks.service.ts";

@Module({
  imports: [IntegrationsModule, IssuesModule, RunsModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhookSignatureService, WebhookNormalizer],
})
export class WebhooksModule {}
