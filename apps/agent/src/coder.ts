import {
  type AgentCodeRequest,
  type AgentFailure,
  type PatchSubmission,
  patchSubmissionSchema,
} from "@repo/types";

import type { Env } from "./config/env.schema.ts";
import type { Logger } from "./lib/logger.ts";
import type { ChatClient } from "./llm/chat.client.ts";
import { runToolLoop } from "./llm/tool-loop.ts";
import { findDeniedPaths } from "./patch/denylist.ts";
import {
  buildCoderSystemPrompt,
  formatIssueContext,
} from "./prompts/system.ts";
import type { WorkspaceManager } from "./repo/workspace.ts";
import type { ToolDefinition } from "./tools/index.ts";
import { EXPLORATION_TOOLS, runExplorationTool } from "./tools/index.ts";

const SUBMIT_PATCH: ToolDefinition = {
  name: "submit_patch",
  description: "Emit the final patch (coder stage only).",
  parameters: {
    type: "object",
    properties: {
      changes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            path: { type: "string" },
            oldContent: { type: "string" },
            newContent: { type: "string" },
          },
          required: ["path", "oldContent", "newContent"],
        },
      },
      commitMessage: { type: "string" },
      testsToRun: { type: "array", items: { type: "string" } },
      rationale: { type: "string" },
    },
    required: ["changes", "commitMessage", "testsToRun", "rationale"],
  },
};

const NEEDS_REPLAN: ToolDefinition = {
  name: "needs_replan",
  description: "Ask the orchestrator to replan (wrong file scope).",
  parameters: {
    type: "object",
    properties: {
      reason: { type: "string" },
    },
    required: ["reason"],
  },
};

export type CodeOutcome =
  | { ok: true; value: PatchSubmission; model: string }
  | { ok: false; failure: AgentFailure };

export async function runCoder(input: {
  request: AgentCodeRequest;
  client: ChatClient;
  env: Env;
  workspaces: WorkspaceManager;
  logger: Logger;
}): Promise<CodeOutcome> {
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

  const planSummary = [
    `Root cause: ${input.request.plan.rootCause}`,
    `Change strategy: ${input.request.plan.changeStrategy}`,
    `Files to inspect: ${input.request.plan.filesToInspect.join(", ")}`,
    `Tests to run: ${input.request.plan.testsToRun.join(", ") || "(none)"}`,
    input.request.previousError
      ? `Previous validator error:\n${input.request.previousError}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const tools = [...EXPLORATION_TOOLS, SUBMIT_PATCH, NEEDS_REPLAN];
  const loop = await runToolLoop({
    client: input.client,
    model: input.env.LLM_MODEL_CODER,
    system: buildCoderSystemPrompt(repoAgents),
    user: `${formatIssueContext(input.request.context)}\n\n## Plan\n${planSummary}`,
    tools,
    maxTurns: input.env.LLM_MAX_TURNS,
    logger: input.logger,
    handleTool: async (name, args) => {
      if (name === "submit_patch" || name === "needs_replan") {
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

  if (loop.terminal.name === "needs_replan") {
    return {
      ok: false,
      failure: {
        kind: "needs_replan",
        reason: String(loop.terminal.args.reason ?? "coder requested replan"),
      },
    };
  }

  const parsed = patchSubmissionSchema.safeParse(loop.terminal.args);
  if (!parsed.success) {
    return {
      ok: false,
      failure: {
        kind: "retryable",
        reason: `submit_patch failed schema validation: ${parsed.error.message}`,
      },
    };
  }

  const patch = parsed.data;
  const denied = findDeniedPaths(patch.changes.map((c) => c.path));
  if (denied.length > 0) {
    return {
      ok: false,
      failure: {
        kind: "terminal",
        reason: `patch touches deny-listed paths: ${denied.join(", ")}`,
      },
    };
  }

  if (workspaceDir) {
    const { readFile } = await import("node:fs/promises");
    const { resolveInsideRoot, PatchApplyError } = await import(
      "./patch/apply.ts"
    );
    for (const change of patch.changes) {
      try {
        const absolute = resolveInsideRoot(workspaceDir, change.path);
        let existing = "";
        try {
          existing = await readFile(absolute, "utf8");
        } catch {
          existing = "";
        }
        if (existing !== change.oldContent) {
          return {
            ok: false,
            failure: {
              kind: "retryable",
              reason: `oldContent mismatch for ${change.path}`,
            },
          };
        }
      } catch (error) {
        if (error instanceof PatchApplyError) {
          return {
            ok: false,
            failure: { kind: "terminal", reason: error.message },
          };
        }
        throw error;
      }
    }
  }

  return { ok: true, value: patch, model: loop.model };
}
