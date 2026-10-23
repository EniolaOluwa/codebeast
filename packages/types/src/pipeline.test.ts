import { describe, expect, it } from "vitest";

import { RUN_STATUSES } from "./enums.ts";
import {
  MAX_ATTEMPTS,
  MAX_REPLANS,
  RUN_TRANSITIONS,
  canTransition,
  patchSubmissionSchema,
  planBlueprintSchema,
  validationResultSchema,
} from "./pipeline.ts";

describe("plan blueprint", () => {
  const validPlan = {
    rootCause: "export.ts:47 dereferences row before the empty-result guard",
    filesToInspect: ["api/src/routes/export.ts"],
    changeStrategy: "Add an early return for empty result sets.",
    testsToRun: ["api/src/routes/export.test.ts"],
    confidence: 0.92,
    needsMoreContext: false,
  };

  it("accepts a valid plan", () => {
    expect(planBlueprintSchema.parse(validPlan).confidence).toBe(0.92);
  });

  it("requires missingContext when needsMoreContext is true", () => {
    expect(
      planBlueprintSchema.safeParse({ ...validPlan, needsMoreContext: true })
        .success,
    ).toBe(false);

    expect(
      planBlueprintSchema.safeParse({
        ...validPlan,
        needsMoreContext: true,
        missingContext: ["Sentry stack trace"],
      }).success,
    ).toBe(true);
  });

  it("caps filesToInspect at 15 (root AGENTS.md §6.1)", () => {
    const tooMany = Array.from({ length: 16 }, (_, i) => `file-${i}.ts`);
    expect(
      planBlueprintSchema.safeParse({ ...validPlan, filesToInspect: tooMany })
        .success,
    ).toBe(false);
  });
});

describe("patch submission", () => {
  it("requires at least one change and a rationale", () => {
    expect(
      patchSubmissionSchema.safeParse({
        changes: [{ path: "a.ts", oldContent: "", newContent: "x" }],
        commitMessage: "fix: x",
        testsToRun: [],
        rationale: "why",
      }).success,
    ).toBe(true);

    expect(
      patchSubmissionSchema.safeParse({
        changes: [],
        commitMessage: "fix: x",
        testsToRun: [],
        rationale: "why",
      }).success,
    ).toBe(false);
  });
});

describe("validation result", () => {
  it("defaults output to an empty string", () => {
    const parsed = validationResultSchema.parse({
      status: "PASSED",
      testsRun: ["a.test.ts"],
      lintPassed: true,
      typesPassed: true,
    });
    expect(parsed.output).toBe("");
  });
});

describe("run state machine", () => {
  it("keeps terminal states terminal", () => {
    for (const status of [
      "SUCCEEDED",
      "FAILED",
      "ESCALATED",
      "CANCELLED",
    ] as const) {
      expect(RUN_TRANSITIONS[status]).toHaveLength(0);
    }
  });

  it("has a transition entry for every run status", () => {
    for (const status of RUN_STATUSES) {
      expect(RUN_TRANSITIONS[status]).toBeDefined();
    }
  });

  it("only allows transitions declared in the table", () => {
    expect(canTransition("QUEUED", "PLANNING")).toBe(true);
    expect(canTransition("QUEUED", "SUCCEEDED")).toBe(false);
    expect(canTransition("VALIDATING", "OPENING_PR")).toBe(true);
    // Validator failure returns to the coder (root AGENTS.md §6.3).
    expect(canTransition("VALIDATING", "CODING")).toBe(true);
    expect(canTransition("OPENING_PR", "SUCCEEDED")).toBe(true);
    expect(canTransition("SUCCEEDED", "QUEUED")).toBe(false);
  });

  it("encodes the retry budget from root AGENTS.md §6.4", () => {
    expect(MAX_ATTEMPTS).toBe(3);
    expect(MAX_REPLANS).toBe(1);
  });
});
