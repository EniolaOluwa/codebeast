import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  DISCORD_CLIENT,
  type DiscordClient,
} from "../../clients/discord.client.ts";
import { DiscordApiClient } from "../../clients/discord-api.client.ts";
import { StubDiscordClient } from "../../clients/stub-discord.client.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";
import { IntegrationsModule } from "../integrations/integrations.module.ts";
import { IntegrationsService } from "../integrations/integrations.service.ts";
import { WebhooksModule } from "../webhooks/webhooks.module.ts";
import { DiscordScanService } from "./discord-scan.service.ts";

@Module({
  imports: [IntegrationsModule, WebhooksModule],
  providers: [
    DiscordScanService,
    {
      provide: DISCORD_CLIENT,
      inject: [ConfigService, PrismaService, IntegrationsService],
      useFactory: (
        config: ConfigService,
        prisma: PrismaService,
        integrations: IntegrationsService,
      ): DiscordClient =>
        config.get<string>("DISCORD_CLIENT_MODE") === "api"
          ? new DiscordApiClient(prisma, integrations)
          : new StubDiscordClient(),
    },
  ],
  exports: [DiscordScanService, DISCORD_CLIENT],
})
export class DiscordModule {}
