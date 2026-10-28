import { describe, expect, it, vi } from "vitest";

import { HttpAgentClient } from "./http-agent.client.ts";

function config(values: Record<string, string>) {
  return {
    getOrThrow: (key: string) => {
      const value = values[key];
      if (value === undefined) {
        throw new Error(`missing ${key}`);
      }
      return value;
    },
  };
}

describe("HttpAgentClient", () => {
  it("parses a successful plan response", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        rootCause: "x",
        filesToInspect: ["a.ts"],
        changeStrategy: "fix",
        testsToRun: [],
        confidence: 0.9,
        needsMoreContext: false,
      }),
    );

    const client = new HttpAgentClient(
      config({
        AGENT_SERVICE_URL: "http://agent:3002",
        AGENT_SERVICE_TOKEN: "secret",
      }) as never,
      fetchImpl as unknown as typeof fetch,
    );

    const result = await client.plan({
      context: {
        issueId: "i1",
        title: "t",
        summary: "s",
        repository: null,
        signals: [],
        topFrames: [],
        enrichment: null,
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.rootCause).toBe("x");
    }
  });

  it("maps 422 to AgentFailure", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(
        { kind: "needs_replan", reason: "wrong files" },
        { status: 422 },
      ),
    );

    const client = new HttpAgentClient(
      config({
        AGENT_SERVICE_URL: "http://agent:3002",
        AGENT_SERVICE_TOKEN: "secret",
      }) as never,
      fetchImpl as unknown as typeof fetch,
    );

    const result = await client.plan({
      context: {
        issueId: "i1",
        title: "t",
        summary: "s",
        repository: null,
        signals: [],
        topFrames: [],
        enrichment: null,
      },
    });

    expect(result).toEqual({
      ok: false,
      failure: { kind: "needs_replan", reason: "wrong files" },
    });
  });
});
