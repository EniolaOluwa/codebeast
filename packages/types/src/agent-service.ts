import { z } from "zod";

import { issueContextSchema } from "./issues.ts";
import {
  patchSubmissionSchema,
  planBlueprintSchema,
  validationResultSchema,
} from "./pipeline.ts";

/**
 * HTTP wire contracts between `apps/api` and `apps/agent`. Checkout tokens are
 * write-only on the wire — never persist or log them.
 */

export const agentFailureKindSchema = z.enum([
  "retryable",
  "terminal",
  "needs_replan",
]);
export type AgentFailureKind = z.infer<typeof agentFailureKindSchema>;

export const agentFailureSchema = z.object({
  kind: agentFailureKindSchema,
  reason: z.string().min(1),
});
export type AgentFailure = z.infer<typeof agentFailureSchema>;

export const repositoryCheckoutSchema = z.object({
  fullName: z.string().min(1),
  ref: z.string().min(1),
  /** Short-lived GitHub installation token. Never store or log. */
  token: z.string().min(1),
});
export type RepositoryCheckout = z.infer<typeof repositoryCheckoutSchema>;

const checkoutRequiredWhenRepo = <
  T extends { context: z.infer<typeof issueContextSchema>; checkout?: unknown },
>(
  value: T,
) => value.context.repository === null || value.checkout !== undefined;

const checkoutRefineMessage =
  "checkout is required when context.repository is set";

export const agentPlanRequestSchema = z
  .object({
    context: issueContextSchema,
    checkout: repositoryCheckoutSchema.optional(),
  })
  .refine(checkoutRequiredWhenRepo, {
    message: checkoutRefineMessage,
    path: ["checkout"],
  });
export type AgentPlanRequest = z.infer<typeof agentPlanRequestSchema>;

export const agentCodeRequestSchema = z
  .object({
    context: issueContextSchema,
    plan: planBlueprintSchema,
    previousError: z.string().optional(),
    checkout: repositoryCheckoutSchema.optional(),
  })
  .refine(checkoutRequiredWhenRepo, {
    message: checkoutRefineMessage,
    path: ["checkout"],
  });
export type AgentCodeRequest = z.infer<typeof agentCodeRequestSchema>;

export const agentValidateRequestSchema = z
  .object({
    context: issueContextSchema,
    patch: patchSubmissionSchema,
    checkout: repositoryCheckoutSchema.optional(),
  })
  .refine(checkoutRequiredWhenRepo, {
    message: checkoutRefineMessage,
    path: ["checkout"],
  });
export type AgentValidateRequest = z.infer<typeof agentValidateRequestSchema>;

/** Validation response may carry a sandbox run id for audit. */
export const agentValidationResultSchema = validationResultSchema.extend({
  sandboxRunId: z.string().min(1).optional(),
});
export type AgentValidationResult = z.infer<typeof agentValidationResultSchema>;

export const agentPlanResponseSchema = planBlueprintSchema;
export const agentCodeResponseSchema = patchSubmissionSchema;
export const agentValidateResponseSchema = agentValidationResultSchema;
