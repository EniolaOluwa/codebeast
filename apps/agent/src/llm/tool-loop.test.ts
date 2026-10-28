import { describe, expect, it } from "vitest";

import { createLogger } from "../lib/logger.ts";
import { ChatClient } from "./chat.client.ts";
import { runToolLoop } from "./tool-loop.ts";

describe("runToolLoop", () => {
  it("returns the terminal tool args from submit_plan", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return Response.json({
        model: "m1",
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "c1",
                  type: "function",
                  function: {
                    name: "submit_plan",
                    arguments: JSON.stringify({
                      rootCause: "x",
                      filesToInspect: ["a.ts"],
                      changeStrategy: "fix",
                      testsToRun: [],
                      confidence: 0.9,
                      needsMoreContext: false,
                    }),
                  },
                },
              ],
            },
          },
        ],
      });
    };

    const client = new ChatClient({
      baseUrl: "https://llm.example",
      apiKey: "k",
      logger: createLogger({ LOG_LEVEL: "error", NODE_ENV: "test" }),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await runToolLoop({
      client,
      model: "m1",
      system: "sys",
      user: "user",
      tools: [
        {
          name: "submit_plan",
          description: "plan",
          parameters: { type: "object", properties: {} },
        },
      ],
      maxTurns: 3,
      logger: createLogger({ LOG_LEVEL: "error", NODE_ENV: "test" }),
      handleTool: async (name, args) => {
        if (name === "submit_plan") {
          return { kind: "terminal", name, args };
        }
        return { kind: "result", content: "ok" };
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.terminal.args.rootCause).toBe("x");
    }
    expect(calls).toBe(1);
  });
});
