import { z } from "zod";

import { IssueContextSchema } from "./issue.ts";

/**
 * Planner output — mirrors root AGENTS.md §6.1.
 */
export const PlanBlueprintSchema = z.object({
  rootCause: z.string().min(1),
  filesToInspect: z.array(z.string().min(1)).min(1).max(15),
  changeStrategy: z.string().min(1),
  testsToRun: z.array(z.string().min(1)),
  confidence: z.number().min(0).max(1),
  needsMoreContext: z.boolean(),
  missingContext: z.array(z.string()).optional(),
});
export type PlanBlueprint = z.infer<typeof PlanBlueprintSchema>;

export const FileChangeSchema = z.object({
  path: z.string().min(1),
  oldContent: z.string(),
  newContent: z.string(),
});
export type FileChange = z.infer<typeof FileChangeSchema>;

/**
 * Coder output — mirrors root AGENTS.md §6.2.
 */
export const PatchSubmissionSchema = z.object({
  changes: z.array(FileChangeSchema).min(1),
  commitMessage: z.string().min(1),
  testsToRun: z.array(z.string()),
  rationale: z.string().min(1),
});
export type PatchSubmission = z.infer<typeof PatchSubmissionSchema>;

export const ValidationResultSchema = z.object({
  runId: z.string(),
  passed: z.boolean(),
  lintPassed: z.boolean(),
  typecheckPassed: z.boolean(),
  testsPassed: z.boolean(),
  testsToRun: z.array(z.string()),
  output: z.string(),
  durationMs: z.number().int().nonnegative(),
});
export type ValidationResult = z.infer<typeof ValidationResultSchema>;

export const EscalationSchema = z.object({
  reason: z.string().min(1),
  lastError: z.string(),
  suggestedNextStep: z.string().min(1),
});
export type Escalation = z.infer<typeof EscalationSchema>;

/**
 * Agent service transport contract. The api orchestrates; the agent reasons.
 */
export const PlanRequestSchema = z.object({
  context: IssueContextSchema,
});
export type PlanRequest = z.infer<typeof PlanRequestSchema>;

export const PlanResponseSchema = z.object({
  plan: PlanBlueprintSchema,
  model: z.string(),
});
export type PlanResponse = z.infer<typeof PlanResponseSchema>;

export const CodeRequestSchema = z.object({
  context: IssueContextSchema,
  plan: PlanBlueprintSchema,
  previousError: z.string().nullable().default(null),
});
export type CodeRequest = z.infer<typeof CodeRequestSchema>;

export const CodeResponseSchema = z.object({
  patch: PatchSubmissionSchema,
  model: z.string(),
});
export type CodeResponse = z.infer<typeof CodeResponseSchema>;

export const ValidateRequestSchema = z.object({
  context: IssueContextSchema,
  patch: PatchSubmissionSchema,
});
export type ValidateRequest = z.infer<typeof ValidateRequestSchema>;

export const MAX_ATTEMPTS = 3;
export const MAX_REPLANS = 1;
