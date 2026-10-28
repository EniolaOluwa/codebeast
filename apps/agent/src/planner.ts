import {
  type AgentFailure,
  type AgentPlanRequest,
  type PlanBlueprint,
  planBlueprintSchema,
} from "@repo/types";

import type { Env } from "./config/env.schema.ts";
import type { Logger } from "./lib/logger.ts";
import type { ChatClient } from "./llm/chat.client.ts";
import { runToolLoop } from "./llm/tool-loop.ts";
import {
  buildPlannerSystemPrompt,
  formatIssueContext,
} from "./prompts/system.ts";
import type { WorkspaceManager } from "./repo/workspace.ts";
import type { ToolDefinition } from "./tools/index.ts";
import { EXPLORATION_TOOLS, runExplorationTool } from "./tools/index.ts";

const SUBMIT_PLAN: ToolDefinition = {
  name: "submit_plan",
  description: "Emit the fix blueprint (planner stage only).",
  parameters: {
    type: "object",
    properties: {
      rootCause: { type: "string" },
      filesToInspect: { type: "array", items: { type: "string" } },
      changeStrategy: { type: "string" },
      testsToRun: { type: "array", items: { type: "string" } },
      confidence: { type: "number" },
      needsMoreContext: { type: "boolean" },
      missingContext: { type: "array", items: { type: "string" } },
    },
    required: [
      "rootCause",
      "filesToInspect",
      "changeStrategy",
      "testsToRun",
      "confidence",
      "needsMoreContext",
    ],
  },
};

export type PlanOutcome =
  | { ok: true; value: PlanBlueprint; model: string }
  | { ok: false; failure: AgentFailure };

export async function runPlanner(input: {
  request: AgentPlanRequest;
  client: ChatClient;
  env: Env;
  workspaces: WorkspaceManager;
  logger: Logger;
}): Promise<PlanOutcome> {
  let workspaceDir: string | null = null;
  let repoAgents: string | null = null;

  if (input.request.checkout) {
    try {
      workspaceDir = await input.workspaces.ensureCheckout(
        input.request.checkout,
      );
      repoAgents = await input.workspaces.readRepoAgentsMd(workspaceDir);
    } catch (error) {
      return {
        ok: false,
        failure: {
          kind: "retryable",
          reason: `workspace checkout failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      };
    }
  }

  const tools = [...EXPLORATION_TOOLS, SUBMIT_PLAN];
  const loop = await runToolLoop({
    client: input.client,
    model: input.env.LLM_MODEL_PLANNER,
    system: buildPlannerSystemPrompt(repoAgents),
    user: formatIssueContext(input.request.context),
    tools,
    maxTurns: input.env.LLM_MAX_TURNS,
    logger: input.logger,
    handleTool: async (name, args) => {
      if (name === "submit_plan") {
        return { kind: "terminal", name, args };
      }
      if (!workspaceDir) {
        return {
          kind: "result",
          content:
            "No repository checkout available; cannot explore the filesystem.",
        };
      }
      try {
        const content = await runExplorationTool(workspaceDir, name, args);
        return { kind: "result", content };
      } catch (error) {
        return {
          kind: "result",
          content: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

  if (!loop.ok) {
    return loop;
  }

  const parsed = planBlueprintSchema.safeParse(loop.terminal.args);
  if (!parsed.success) {
    return {
      ok: false,
      failure: {
        kind: "retryable",
        reason: `submit_plan failed schema validation: ${parsed.error.message}`,
      },
    };
  }

  const plan = parsed.data;
  if (plan.confidence < 0.5 && !plan.needsMoreContext) {
    return {
      ok: true,
      model: loop.model,
      value: {
        ...plan,
        needsMoreContext: true,
        missingContext: plan.missingContext ?? [
          "confidence below 0.5; need more context",
        ],
      },
    };
  }

  return { ok: true, value: plan, model: loop.model };
}
