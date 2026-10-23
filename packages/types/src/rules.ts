import { z } from "zod";

import { providerSchema, ruleKindSchema } from "./enums.ts";

/**
 * Rules engine contracts (design.md §8.5). Detection rules decide what
 * becomes a report (first match wins; no match = detect); automation rules
 * decide what ships once a run is ready.
 */

export const ruleConditionsSchema = z.object({
  /** Empty/omitted = any source. */
  providers: z.array(providerSchema).min(1).optional(),
  minSignalCount: z.number().int().min(1).max(1000).optional(),
  titleContains: z.string().min(1).max(200).optional(),
});
export type RuleConditions = z.infer<typeof ruleConditionsSchema>;

export const detectionActionsSchema = z.object({
  action: z.enum(["DETECT", "IGNORE"]),
});
export type DetectionActions = z.infer<typeof detectionActionsSchema>;

/**
 * PR safety rails (design.md §8.5): opening PRs requires a target
 * repository, a minimum confidence and a daily limit — the schema refuses to
 * validate otherwise, so an under-configured rule can never be enabled.
 */
export const automationActionsSchema = z
  .object({
    createTicket: z.boolean().default(false),
    openPr: z.boolean().default(false),
    repositoryId: z.string().min(1).optional(),
    minConfidence: z.number().min(0).max(1).optional(),
    dailyPrLimit: z.number().int().min(1).max(100).optional(),
    /** Informational until the GitHub client applies reviewers. */
    reviewers: z.array(z.string().min(1)).max(10).optional(),
  })
  .refine((actions) => actions.createTicket || actions.openPr, {
    message: "An automation rule needs at least one action",
  })
  .refine(
    (actions) =>
      !actions.openPr ||
      (actions.repositoryId !== undefined &&
        actions.minConfidence !== undefined &&
        actions.dailyPrLimit !== undefined),
    {
      message:
        "Opening PRs requires a repository, a minimum confidence and a daily PR limit",
      path: ["openPr"],
    },
  );
export type AutomationActions = z.infer<typeof automationActionsSchema>;

export const ruleCreateInputSchema = z
  .object({
    kind: ruleKindSchema,
    name: z.string().min(1).max(100),
    enabled: z.boolean().default(false),
    conditions: ruleConditionsSchema.default({}),
    actions: z.union([detectionActionsSchema, automationActionsSchema]),
  })
  .superRefine((input, ctx) => {
    const parsed =
      input.kind === "DETECTION"
        ? detectionActionsSchema.safeParse(input.actions)
        : automationActionsSchema.safeParse(input.actions);

    if (!parsed.success) {
      ctx.addIssue({
        code: "custom",
        message:
          input.kind === "DETECTION"
            ? "Detection rules need a detect/ignore action"
            : "Automation actions are invalid",
        path: ["actions"],
      });
    }
  });
export type RuleCreateInput = z.infer<typeof ruleCreateInputSchema>;

export const ruleUpdateInputSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  enabled: z.boolean().optional(),
  conditions: ruleConditionsSchema.optional(),
  actions: z
    .union([detectionActionsSchema, automationActionsSchema])
    .optional(),
});
export type RuleUpdateInput = z.infer<typeof ruleUpdateInputSchema>;

export const ruleListQuerySchema = z.object({
  kind: ruleKindSchema.optional(),
});
export type RuleListQuery = z.infer<typeof ruleListQuerySchema>;

export const ruleSchema = z.object({
  id: z.string().min(1),
  kind: ruleKindSchema,
  name: z.string().min(1),
  enabled: z.boolean(),
  conditions: ruleConditionsSchema,
  actions: z.union([detectionActionsSchema, automationActionsSchema]),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Rule = z.infer<typeof ruleSchema>;

export const ruleDryRunSchema = z.object({
  ruleId: z.string().min(1),
  windowDays: z.number().int().positive(),
  matched: z.number().int().min(0),
  sample: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      status: z.string().min(1),
    }),
  ),
});
export type RuleDryRun = z.infer<typeof ruleDryRunSchema>;
