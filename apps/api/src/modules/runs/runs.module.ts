import { Module } from "@nestjs/common";

import { AGENT_CLIENT } from "../../clients/agent.client.ts";
import { StubAgentClient } from "../../clients/stub-agent.client.ts";
import { TriageModule } from "../triage/triage.module.ts";
import { RunOrchestrator } from "./run-orchestrator.service.ts";
import { WorkersService } from "./workers.service.ts";

@Module({
  imports: [TriageModule],
  providers: [
    RunOrchestrator,
    WorkersService,
    // Phase 4 uses the deterministic stub; the real agent client swaps in here.
    { provide: AGENT_CLIENT, useClass: StubAgentClient },
  ],
  exports: [RunOrchestrator],
})
export class RunsModule {}
