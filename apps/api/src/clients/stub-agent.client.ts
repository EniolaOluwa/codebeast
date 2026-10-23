import { Injectable, Logger } from "@nestjs/common";
import type {
  IssueContext,
  PatchSubmission,
  PlanBlueprint,
  ValidationResult,
} from "@repo/types";

import type { AgentClient, AgentResult } from "./agent.client.ts";

/**
 * Deterministic happy-path stand-in for the reasoning service: plans, patches
 * and "validates" a trivial change so the orchestration around it can be
 * exercised end to end. Replaced when `apps/agent` lands.
 */
@Injectable()
export class StubAgentClient implements AgentClient {
  private readonly logger = new Logger(StubAgentClient.name);

  async plan(input: {
    context: IssueContext;
  }): Promise<AgentResult<PlanBlueprint>> {
    this.logger.log(`stub plan for issue ${input.context.issueId}`);

    return {
      ok: true,
      value: {
        rootCause: `stub: ${input.context.title}`,
        filesToInspect: ["src/example.ts"],
        changeStrategy: "stub change strategy",
        testsToRun: [],
        confidence: 0.5,
        needsMoreContext: false,
      },
    };
  }

  async code(input: {
    context: IssueContext;
    plan: PlanBlueprint;
    previousError?: string;
  }): Promise<AgentResult<PatchSubmission>> {
    this.logger.log(
      `stub code for issue ${input.context.issueId}${input.previousError ? " (retry)" : ""}`,
    );

    return {
      ok: true,
      value: {
        changes: [
          {
            path: "src/example.ts",
            oldContent: "",
            newContent: "// stub patch\n",
          },
        ],
        commitMessage: "fix: stub patch",
        testsToRun: [],
        rationale: "stub rationale",
      },
    };
  }

  async validate(input: {
    patch: PatchSubmission;
    context: IssueContext;
  }): Promise<AgentResult<ValidationResult>> {
    this.logger.log(`stub validate for issue ${input.context.issueId}`);

    return {
      ok: true,
      value: {
        status: "PASSED",
        testsRun: [],
        lintPassed: true,
        typesPassed: true,
        output: "",
      },
    };
  }
}
