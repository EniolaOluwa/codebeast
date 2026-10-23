import { z } from "zod";

import { runStatusSchema, type RunStatus } from "./enums.ts";

/**
 * Agent pipeline contracts (root `AGENTS.md` §6) and the run state machine.
 * The state machine encodes §6.4: up to 3 attempts, one replan, then
 * escalate. State and attempt accounting live in Postgres; this module is the
 * single source of truth for which transitions are legal.
 */

export const MAX_ATTEMPTS = 3;
export const MAX_REPLANS = 1;

export const RUN_TRANSITIONS: Record<RunStatus, readonly RunStatus[]> = {
  QUEUED: ["PLANNING", "FAILED", "CANCELLED"],
  // Self-loops are retries of the same stage (attempt + 1).
  PLANNING: ["CODING", "PLANNING", "FAILED", "ESCALATED", "CANCELLED"],
  CODING: [
    "VALIDATING",
    "CODING",
    "PLANNING",
    "FAILED",
    "ESCALATED",
    "CANCELLED",
  ],
  VALIDATING: [
    "OPENING_PR",
    "VALIDATING",
    "CODING",
    "FAILED",
    "ESCALATED",
    "CANCELLED",
  ],
  OPENING_PR: ["SUCCEEDED", "OPENING_PR", "FAILED", "ESCALATED", "CANCELLED"],
  SUCCEEDED: [],
  FAILED: [],
  ESCALATED: [],
  CANCELLED: [],
};

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  return RUN_TRANSITIONS[from].includes(to);
}

export const planBlueprintSchema = z
  .object({
    rootCause: z.string().min(1),
    filesToInspect: z.array(z.string().min(1)).min(1).max(15),
    changeStrategy: z.string().min(1),
    testsToRun: z.array(z.string().min(1)),
    confidence: z.number().min(0).max(1),
    needsMoreContext: z.boolean(),
    missingContext: z.array(z.string().min(1)).optional(),
  })
  .refine(
    (plan) => !plan.needsMoreContext || (plan.missingContext?.length ?? 0) > 0,
    {
      message:
        "missingContext is required when needsMoreContext is true (AGENTS.md §6.1)",
      path: ["missingContext"],
    },
  );
export type PlanBlueprint = z.infer<typeof planBlueprintSchema>;

export const patchSubmissionSchema = z.object({
  changes: z
    .array(
      z.object({
        path: z.string().min(1),
        oldContent: z.string(),
        newContent: z.string(),
      }),
    )
    .min(1),
  commitMessage: z.string().min(1),
  testsToRun: z.array(z.string().min(1)),
  rationale: z.string().min(1),
});
export type PatchSubmission = z.infer<typeof patchSubmissionSchema>;

export const validationResultSchema = z.object({
  status: z.enum(["PASSED", "FAILED", "ERRORED"]),
  testsRun: z.array(z.string().min(1)),
  lintPassed: z.boolean(),
  typesPassed: z.boolean(),
  output: z.string().max(65_536).default(""),
  durationMs: z.number().int().min(0).optional(),
});
export type ValidationResult = z.infer<typeof validationResultSchema>;
