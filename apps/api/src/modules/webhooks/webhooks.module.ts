import { Module } from "@nestjs/common";

import { IntegrationsModule } from "../integrations/integrations.module.ts";
import { RulesModule } from "../rules/rules.module.ts";
import { CorrelationService } from "./correlation.service.ts";
import { PullRequestSyncService } from "./pull-request-sync.service.ts";
import { RawBodyInitializer } from "./raw-body.ts";
import { SignalIngestService } from "./signal-ingest.service.ts";
import { WebhookPipelineService } from "./webhook-pipeline.service.ts";
import { WebhooksController } from "./webhooks.controller.ts";

@Module({
  imports: [IntegrationsModule, RulesModule],
  controllers: [WebhooksController],
  providers: [
    RawBodyInitializer,
    WebhookPipelineService,
    CorrelationService,
    PullRequestSyncService,
    SignalIngestService,
  ],
  exports: [WebhookPipelineService, SignalIngestService],
})
export class WebhooksModule {}
