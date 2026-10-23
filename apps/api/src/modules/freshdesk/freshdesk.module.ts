import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  FRESHDESK_CLIENT,
  type FreshdeskClient,
} from "../../clients/freshdesk.client.ts";
import { FreshdeskApiClient } from "../../clients/freshdesk-api.client.ts";
import { StubFreshdeskClient } from "../../clients/stub-freshdesk.client.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";
import { IntegrationsModule } from "../integrations/integrations.module.ts";
import { IntegrationsService } from "../integrations/integrations.service.ts";
import { WebhooksModule } from "../webhooks/webhooks.module.ts";
import { FreshdeskScanService } from "./freshdesk-scan.service.ts";

@Module({
  imports: [IntegrationsModule, WebhooksModule],
  providers: [
    FreshdeskScanService,
    {
      provide: FRESHDESK_CLIENT,
      inject: [ConfigService, PrismaService, IntegrationsService],
      useFactory: (
        config: ConfigService,
        prisma: PrismaService,
        integrations: IntegrationsService,
      ): FreshdeskClient =>
        config.get<string>("FRESHDESK_CLIENT_MODE") === "api"
          ? new FreshdeskApiClient(prisma, integrations)
          : new StubFreshdeskClient(),
    },
  ],
  exports: [FreshdeskScanService, FRESHDESK_CLIENT],
})
export class FreshdeskModule {}
