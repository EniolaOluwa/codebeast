import type {
  PatchSubmission,
  PlanBlueprint,
  ValidationResult,
} from "@repo/types";

import type { AgentResult } from "../../src/clients/agent.client.ts";

/** Canonical happy-path agent outputs shared by the e2e suites. */

export const planOk = (): AgentResult<PlanBlueprint> => ({
  ok: true,
  value: {
    rootCause: "row is undefined before the guard",
    filesToInspect: ["src/export.ts"],
    changeStrategy: "add an early return",
    testsToRun: ["src/export.test.ts"],
    confidence: 0.9,
    needsMoreContext: false,
  },
});

export const codeOk = (): AgentResult<PatchSubmission> => ({
  ok: true,
  value: {
    changes: [
      { path: "src/export.ts", oldContent: "", newContent: "// fixed" },
    ],
    commitMessage: "fix: guard empty exports",
    testsToRun: ["src/export.test.ts"],
    rationale: "guard clause",
  },
});

export const validation = (
  status: "PASSED" | "FAILED" | "ERRORED",
): AgentResult<ValidationResult> => ({
  ok: true,
  value: {
    status,
    testsRun: ["src/export.test.ts"],
    lintPassed: status === "PASSED",
    typesPassed: status === "PASSED",
    output: status === "PASSED" ? "" : `${status} output`,
  },
});

export const passedValidation = (): AgentResult<ValidationResult> =>
  validation("PASSED");
