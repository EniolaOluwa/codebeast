import { z } from "zod";

import { providerSchema } from "./enums.ts";
import { withinBytes } from "./text.ts";

/**
 * Bounds on everything we store or ship to the agent pipeline. Issue context
 * is the input to expensive model calls, so its size is capped at the
 * contract level rather than by convention.
 */

export const MAX_SIGNAL_TITLE_CHARS = 512;
export const MAX_SIGNAL_BODY_BYTES = 32_768;
export const MAX_ISSUE_SUMMARY_BYTES = 32_768;
export const MAX_STACK_FRAMES = 20;
export const MAX_CONTEXT_SIGNALS = 50;
export const MAX_WEBHOOK_RAW_BYTES = 65_536;

const summarySchema = z.string().refine(withinBytes(MAX_ISSUE_SUMMARY_BYTES), {
  message: `summary must be at most ${MAX_ISSUE_SUMMARY_BYTES} UTF-8 bytes`,
});

export const stackFrameSchema = z.object({
  file: z.string().min(1),
  line: z.number().int().positive().optional(),
  functionName: z.string().optional(),
});
export type StackFrame = z.infer<typeof stackFrameSchema>;

export const issueSignalSchema = z.object({
  id: z.string().min(1),
  provider: providerSchema,
  eventType: z.string().min(1),
  title: z.string().min(1).max(MAX_SIGNAL_TITLE_CHARS),
  body: z.string().refine(withinBytes(MAX_SIGNAL_BODY_BYTES), {
    message: `body must be at most ${MAX_SIGNAL_BODY_BYTES} UTF-8 bytes`,
  }),
  url: z.string().nullable(),
  actor: z.string().nullable(),
  occurredAt: z.iso.datetime(),
});
export type IssueSignal = z.infer<typeof issueSignalSchema>;

export const issueContextSchema = z.object({
  issueId: z.string().min(1),
  title: z.string().min(1).max(MAX_SIGNAL_TITLE_CHARS),
  summary: summarySchema,
  repository: z
    .object({
      fullName: z.string().min(1),
      defaultBranch: z.string().min(1),
    })
    .nullable(),
  signals: z.array(issueSignalSchema).max(MAX_CONTEXT_SIGNALS),
  topFrames: z.array(stackFrameSchema).max(MAX_STACK_FRAMES),
  enrichment: z.record(z.string(), z.unknown()).nullable(),
});
export type IssueContext = z.infer<typeof issueContextSchema>;
