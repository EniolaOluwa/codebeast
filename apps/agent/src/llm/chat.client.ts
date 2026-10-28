import type { Logger } from "../lib/logger.ts";
import type { ToolDefinition } from "../tools/index.ts";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: ChatToolCall[];
}

export interface ChatToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatCompletionResult {
  message: ChatMessage;
  model: string;
}

export interface ChatClientOptions {
  baseUrl: string;
  apiKey: string;
  logger: Logger;
  fetchImpl?: typeof fetch;
}

/**
 * Provider-agnostic OpenAI-compatible chat client.
 * Model ids are passed per call from env (LLM_MODEL_*), never hard-coded here.
 */
export class ChatClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly logger: Logger;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ChatClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.logger = options.logger;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async complete(input: {
    model: string;
    messages: ChatMessage[];
    tools: ToolDefinition[];
  }): Promise<ChatCompletionResult> {
    const url = `${this.baseUrl}/chat/completions`;
    const body = {
      model: input.model,
      messages: input.messages,
      tools: input.tools.map((tool) => ({
        type: "function" as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      })),
      tool_choice: "auto" as const,
    };

    let attempt = 0;
    let lastError: Error | undefined;

    while (attempt < 3) {
      attempt += 1;
      try {
        const response = await this.fetchImpl(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
        });

        if (response.status === 429 || response.status >= 500) {
          lastError = new Error(`LLM HTTP ${response.status}`);
          await sleep(250 * attempt);
          continue;
        }

        if (!response.ok) {
          const text = await response.text();
          throw new Error(
            `LLM request failed (${response.status}): ${text.slice(0, 500)}`,
          );
        }

        const json = (await response.json()) as {
          model?: string;
          choices?: {
            message?: {
              role?: string;
              content?: string | null;
              tool_calls?: ChatToolCall[];
            };
          }[];
        };

        const choice = json.choices?.[0]?.message;
        if (!choice) {
          throw new Error("LLM response missing choices[0].message");
        }

        return {
          model: json.model ?? input.model,
          message: {
            role: "assistant",
            content: choice.content ?? null,
            tool_calls: choice.tool_calls,
          },
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt >= 3) {
          break;
        }
        this.logger.warn(
          { attempt, err: lastError.message },
          "LLM call failed; retrying",
        );
        await sleep(250 * attempt);
      }
    }

    throw lastError ?? new Error("LLM call failed");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
