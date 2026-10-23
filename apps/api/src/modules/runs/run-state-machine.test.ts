import { describe, expect, it } from "vitest";

import {
  beginRun,
  decideAfterStage,
  isTerminal,
  type RunState,
} from "./run-state-machine.ts";

function fresh(overrides: Partial<RunState> = {}): RunState {
  return {
    status: "PLANNING",
    attempt: 1,
    maxAttempts: 3,
    replans: 0,
    ...overrides,
  };
}

describe("decideAfterStage — pass path", () => {
  it("advances through every stage without spending attempts", () => {
    expect(decideAfterStage(fresh(), "PLANNING", "passed")).toEqual({
      next: "CODING",
      attempt: 1,
      replans: 0,
    });
    expect(
      decideAfterStage(fresh({ status: "CODING" }), "CODING", "passed"),
    ).toMatchObject({ next: "VALIDATING", attempt: 1 });
    // A passing validation ends the compute run (compute/ship split).
    expect(
      decideAfterStage(fresh({ status: "VALIDATING" }), "VALIDATING", "passed"),
    ).toMatchObject({ next: "SUCCEEDED", attempt: 1 });
  });
});

describe("decideAfterStage — retryable failures", () => {
  it("retries the same stage and spends an attempt", () => {
    expect(decideAfterStage(fresh(), "PLANNING", "retryable")).toEqual({
      next: "PLANNING",
      attempt: 2,
      replans: 0,
    });
  });

  it("honors an explicit retry target (validator failure → coder)", () => {
    expect(
      decideAfterStage(
        fresh({ status: "VALIDATING" }),
        "VALIDATING",
        "retryable",
        {
          retryTo: "CODING",
        },
      ),
    ).toMatchObject({ next: "CODING", attempt: 2 });
  });

  it("escalates when the attempt budget is exhausted", () => {
    expect(
      decideAfterStage(fresh({ attempt: 3 }), "PLANNING", "retryable"),
    ).toMatchObject({ next: "ESCALATED", reason: /attempt budget/ });
  });

  it("refuses illegal retry targets loudly", () => {
    expect(() =>
      decideAfterStage(fresh(), "PLANNING", "retryable", {
        retryTo: "SUCCEEDED",
      }),
    ).toThrow(/Illegal run transition/);
  });
});

describe("decideAfterStage — replans", () => {
  it("sends the run back to planning once, spending an attempt", () => {
    expect(
      decideAfterStage(fresh({ status: "CODING" }), "CODING", "needs_replan"),
    ).toEqual({ next: "PLANNING", attempt: 2, replans: 1 });
  });

  it("escalates on a second replan (root AGENTS.md §6.4)", () => {
    expect(
      decideAfterStage(
        fresh({ status: "CODING", replans: 1, attempt: 2 }),
        "CODING",
        "needs_replan",
      ),
    ).toMatchObject({ next: "ESCALATED", reason: /replan budget/ });
  });

  it("escalates when no attempts remain", () => {
    expect(
      decideAfterStage(fresh({ attempt: 3 }), "PLANNING", "needs_replan"),
    ).toMatchObject({ next: "ESCALATED" });
  });
});

describe("decideAfterStage — terminal failures", () => {
  it("fails the run without spending attempts", () => {
    expect(
      decideAfterStage(fresh(), "PLANNING", "failed", { reason: "denylist" }),
    ).toMatchObject({ next: "FAILED", reason: "denylist", attempt: 1 });
  });
});

describe("helpers", () => {
  it("beginRun starts planning at attempt 1", () => {
    expect(beginRun()).toEqual({ status: "PLANNING", attempt: 1 });
  });

  it("knows terminal statuses", () => {
    for (const status of [
      "SUCCEEDED",
      "FAILED",
      "ESCALATED",
      "CANCELLED",
    ] as const) {
      expect(isTerminal(status)).toBe(true);
    }

    for (const status of [
      "QUEUED",
      "PLANNING",
      "CODING",
      "VALIDATING",
      "OPENING_PR",
    ] as const) {
      expect(isTerminal(status)).toBe(false);
    }
  });
});
