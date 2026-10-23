import { Module } from "@nestjs/common";

import { IntegrationsModule } from "../integrations/integrations.module.ts";
import { CorrelationService } from "./correlation.service.ts";
import { PullRequestSyncService } from "./pull-request-sync.service.ts";
import { RawBodyInitializer } from "./raw-body.ts";
import { WebhookPipelineService } from "./webhook-pipeline.service.ts";
import { WebhooksController } from "./webhooks.controller.ts";

@Module({
  imports: [IntegrationsModule],
  controllers: [WebhooksController],
  providers: [
    RawBodyInitializer,
    WebhookPipelineService,
    CorrelationService,
    PullRequestSyncService,
  ],
  exports: [WebhookPipelineService],
})
export class WebhooksModule {}
