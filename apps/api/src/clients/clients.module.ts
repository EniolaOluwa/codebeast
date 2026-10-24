import { Global, Module } from "@nestjs/common";

import { AgentClient } from "./agent.client.ts";
import { GithubClient } from "./github.client.ts";

@Global()
@Module({
  providers: [AgentClient, GithubClient],
  exports: [AgentClient, GithubClient],
})
export class ClientsModule {}
