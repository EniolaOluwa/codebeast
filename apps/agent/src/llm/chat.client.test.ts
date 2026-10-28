import { describe, expect, it, vi } from "vitest";

import { createLogger } from "../lib/logger.ts";
import { ChatClient } from "./chat.client.ts";

describe("ChatClient", () => {
  it("posts to /chat/completions and returns the assistant message", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        model: "test-model",
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: {
                    name: "submit_plan",
                    arguments: "{\"rootCause\":\"x\"}",
                  },
                },
              ],
            },
          },
        ],
      }),
    );

    const client = new ChatClient({
      baseUrl: "https://llm.example",
      apiKey: "key",
      logger: createLogger({ LOG_LEVEL: "error", NODE_ENV: "test" }),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.complete({
      model: "test-model",
      messages: [{ role: "user", content: "hi" }],
      tools: [
        {
          name: "submit_plan",
          description: "plan",
          parameters: { type: "object", properties: {} },
        },
      ],
    });

    expect(result.model).toBe("test-model");
    expect(result.message.tool_calls?.[0]?.function.name).toBe("submit_plan");
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [, init] = fetchImpl.mock.calls[0]!;
    expect((init as RequestInit).headers).toMatchObject({
      authorization: "Bearer key",
    });
  });
});
