import { describe, expect, it } from "vitest";

import {
  agentFailureSchema,
  agentPlanRequestSchema,
  agentValidateRequestSchema,
  repositoryCheckoutSchema,
} from "./agent-service.ts";

const baseContext = {
  issueId: "issue_1",
  title: "export broken",
  summary: "CSV export fails",
  repository: null as null | { fullName: string; defaultBranch: string },
  signals: [],
  topFrames: [],
  enrichment: null,
};

describe("repositoryCheckoutSchema", () => {
  it("requires fullName, ref, and token", () => {
    expect(
      repositoryCheckoutSchema.safeParse({
        fullName: "acme/web",
        ref: "main",
        token: "ghs_x",
      }).success,
    ).toBe(true);

    expect(
      repositoryCheckoutSchema.safeParse({
        fullName: "acme/web",
        ref: "main",
      }).success,
    ).toBe(false);
  });
});

describe("agentFailureSchema", () => {
  it("accepts the three failure kinds", () => {
    for (const kind of ["retryable", "terminal", "needs_replan"] as const) {
      expect(agentFailureSchema.safeParse({ kind, reason: "x" }).success).toBe(
        true,
      );
    }
  });
});

describe("agentPlanRequestSchema", () => {
  it("allows missing checkout when repository is null", () => {
    expect(
      agentPlanRequestSchema.safeParse({ context: baseContext }).success,
    ).toBe(true);
  });

  it("requires checkout when repository is set", () => {
    const withRepo = {
      ...baseContext,
      repository: { fullName: "acme/web", defaultBranch: "main" },
    };

    expect(
      agentPlanRequestSchema.safeParse({ context: withRepo }).success,
    ).toBe(false);

    expect(
      agentPlanRequestSchema.safeParse({
        context: withRepo,
        checkout: { fullName: "acme/web", ref: "main", token: "ghs_x" },
      }).success,
    ).toBe(true);
  });
});

describe("agentValidateRequestSchema", () => {
  const patch = {
    changes: [{ path: "a.ts", oldContent: "", newContent: "x" }],
    commitMessage: "fix: x",
    testsToRun: [],
    rationale: "r",
  };

  it("requires checkout when repository is set", () => {
    const withRepo = {
      ...baseContext,
      repository: { fullName: "acme/web", defaultBranch: "main" },
    };

    expect(
      agentValidateRequestSchema.safeParse({
        context: withRepo,
        patch,
      }).success,
    ).toBe(false);
  });
});
