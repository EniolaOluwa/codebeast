import { Module } from "@nestjs/common";

import { DiscordModule } from "../discord/discord.module.ts";
import { DiscordScanService } from "../discord/discord-scan.service.ts";
import { FreshdeskModule } from "../freshdesk/freshdesk.module.ts";
import { FreshdeskScanService } from "../freshdesk/freshdesk-scan.service.ts";
import { JiraModule } from "../jira/jira.module.ts";
import { JiraScanService } from "../jira/jira-scan.service.ts";
import { ScanRunner } from "./scan-runner.service.ts";
import { SOURCE_SCANNERS } from "./source-scanner.ts";

@Module({
  imports: [JiraModule, DiscordModule, FreshdeskModule],
  providers: [
    ScanRunner,
    {
      provide: SOURCE_SCANNERS,
      inject: [JiraScanService, DiscordScanService, FreshdeskScanService],
      useFactory: (
        jira: JiraScanService,
        discord: DiscordScanService,
        freshdesk: FreshdeskScanService,
      ) => [jira, discord, freshdesk],
    },
  ],
  exports: [ScanRunner],
})
export class ScansModule {}
