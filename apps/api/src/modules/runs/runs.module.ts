import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { AGENT_CLIENT } from "../../clients/agent.client.ts";
import {
  GITHUB_CLIENT,
  type GitHubClient,
} from "../../clients/github.client.ts";
import { OctokitGitHubClient } from "../../clients/octokit-github.client.ts";
import { StubAgentClient } from "../../clients/stub-agent.client.ts";
import { StubGitHubClient } from "../../clients/stub-github.client.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";
import { JiraModule } from "../jira/jira.module.ts";
import { TriageModule } from "../triage/triage.module.ts";
import { RunOrchestrator } from "./run-orchestrator.service.ts";
import { RunsController } from "./runs.controller.ts";
import { RunsService } from "./runs.service.ts";
import { WorkersService } from "./workers.service.ts";

@Module({
  imports: [TriageModule, JiraModule],
  controllers: [RunsController],
  providers: [
    RunOrchestrator,
    WorkersService,
    RunsService,
    // Phase 4 uses the deterministic stub; the real agent client swaps in here.
    { provide: AGENT_CLIENT, useClass: StubAgentClient },
    {
      provide: GITHUB_CLIENT,
      inject: [ConfigService, PrismaService],
      useFactory: (
        config: ConfigService,
        prisma: PrismaService,
      ): GitHubClient => {
        const appId = config.get<string>("GITHUB_APP_ID");
        const privateKeyBase64 = config.get<string>(
          "GITHUB_APP_PRIVATE_KEY_BASE64",
        );

        if (appId && privateKeyBase64) {
          return new OctokitGitHubClient(
            prisma,
            appId,
            Buffer.from(privateKeyBase64, "base64").toString("utf8"),
          );
        }

        // No GitHub App registered yet: the stub keeps the ship flow usable.
        return new StubGitHubClient();
      },
    },
  ],
  exports: [RunOrchestrator],
})
export class RunsModule {}
