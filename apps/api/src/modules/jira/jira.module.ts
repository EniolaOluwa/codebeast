import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { JIRA_CLIENT, type JiraClient } from "../../clients/jira.client.ts";
import { JiraApiClient } from "../../clients/jira-api.client.ts";
import { StubJiraClient } from "../../clients/stub-jira.client.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";
import { IntegrationsModule } from "../integrations/integrations.module.ts";
import { IntegrationsService } from "../integrations/integrations.service.ts";
import { WebhooksModule } from "../webhooks/webhooks.module.ts";
import { JiraScanService } from "./jira-scan.service.ts";

@Module({
  imports: [IntegrationsModule, WebhooksModule],
  providers: [
    JiraScanService,
    {
      provide: JIRA_CLIENT,
      inject: [ConfigService, PrismaService, IntegrationsService],
      useFactory: (
        config: ConfigService,
        prisma: PrismaService,
        integrations: IntegrationsService,
      ): JiraClient =>
        config.get<string>("JIRA_CLIENT_MODE") === "api"
          ? new JiraApiClient(prisma, integrations)
          : new StubJiraClient(),
    },
  ],
  exports: [JiraScanService, JIRA_CLIENT],
})
export class JiraModule {}
