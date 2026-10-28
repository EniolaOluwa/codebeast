import type { AgentFailure } from "@repo/types";

import type { Logger } from "../lib/logger.ts";
import type { ToolDefinition } from "../tools/index.ts";
import {
  type ChatClient,
  type ChatMessage,
  type ChatToolCall,
} from "./chat.client.ts";

export type ToolHandler = (
  name: string,
  args: Record<string, unknown>,
) => Promise<
  | { kind: "result"; content: string }
  | { kind: "terminal"; name: string; args: Record<string, unknown> }
>;

export interface ToolLoopSuccess {
  ok: true;
  terminal: { name: string; args: Record<string, unknown> };
  model: string;
}

export interface ToolLoopFailure {
  ok: false;
  failure: AgentFailure;
}

export async function runToolLoop(input: {
  client: ChatClient;
  model: string;
  system: string;
  user: string;
  tools: ToolDefinition[];
  handleTool: ToolHandler;
  maxTurns: number;
  logger: Logger;
}): Promise<ToolLoopSuccess | ToolLoopFailure> {
  const messages: ChatMessage[] = [
    { role: "system", content: input.system },
    { role: "user", content: input.user },
  ];

  let lastModel = input.model;

  for (let turn = 0; turn < input.maxTurns; turn += 1) {
    let completion;
    try {
      completion = await input.client.complete({
        model: input.model,
        messages,
        tools: input.tools,
      });
    } catch (error) {
      return {
        ok: false,
        failure: {
          kind: "retryable",
          reason: error instanceof Error ? error.message : String(error),
        },
      };
    }

    lastModel = completion.model;
    const message = completion.message;
    messages.push(message);

    const toolCalls = message.tool_calls ?? [];
    if (toolCalls.length === 0) {
      return {
        ok: false,
        failure: {
          kind: "retryable",
          reason: "model returned no tool calls; expected a terminal tool",
        },
      };
    }

    for (const call of toolCalls) {
      const args = parseArgs(call);
      const handled = await input.handleTool(call.function.name, args);

      if (handled.kind === "terminal") {
        return {
          ok: true,
          terminal: handled,
          model: lastModel,
        };
      }

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: handled.content,
      });
    }
  }

  input.logger.warn({ maxTurns: input.maxTurns }, "tool loop exhausted");
  return {
    ok: false,
    failure: {
      kind: "retryable",
      reason: `tool loop exceeded ${input.maxTurns} turns without a terminal tool`,
    },
  };
}

function parseArgs(call: ChatToolCall): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(call.function.arguments || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}
