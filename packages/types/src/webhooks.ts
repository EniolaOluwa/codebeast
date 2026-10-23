import { z } from "zod";

import { providerSchema } from "./enums.ts";
import { MAX_SIGNAL_BODY_BYTES, MAX_SIGNAL_TITLE_CHARS } from "./issues.ts";
import { withinBytes } from "./text.ts";

/**
 * Provider webhook envelopes (loose — providers add fields at will, we only
 * promise to read the documented ones) and the normalized signal every
 * provider parser produces.
 */

export const slackEnvelopeSchema = z.looseObject({
  type: z.string(),
  event_id: z.string().optional(),
  team_id: z.string().optional(),
  event: z
    .looseObject({
      type: z.string(),
      text: z.string().optional(),
      user: z.string().optional(),
      channel: z.string().optional(),
      ts: z.string().optional(),
      thread_ts: z.string().optional(),
    })
    .optional(),
});
export type SlackEnvelope = z.infer<typeof slackEnvelopeSchema>;

export const sentryEnvelopeSchema = z.looseObject({
  action: z.string().optional(),
  installation: z.looseObject({ uuid: z.string().optional() }).optional(),
  data: z
    .looseObject({
      issue: z
        .looseObject({
          id: z.string().optional(),
          title: z.string().optional(),
          culprit: z.string().optional(),
          permalink: z.string().optional(),
          project: z
            .looseObject({
              slug: z.string().optional(),
              name: z.string().optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
});
export type SentryEnvelope = z.infer<typeof sentryEnvelopeSchema>;

export const githubEnvelopeSchema = z.looseObject({
  action: z.string().optional(),
  installation: z.looseObject({ id: z.number().int().optional() }).optional(),
  repository: z
    .looseObject({
      full_name: z.string().optional(),
      default_branch: z.string().optional(),
    })
    .optional(),
  issue: z
    .looseObject({
      number: z.number().int().optional(),
      title: z.string().optional(),
      body: z.string().nullable().optional(),
      html_url: z.string().optional(),
      user: z.looseObject({ login: z.string() }).optional(),
    })
    .optional(),
  pull_request: z
    .looseObject({
      number: z.number().int().optional(),
      title: z.string().optional(),
      html_url: z.string().optional(),
      html_url_branch: z.string().optional(),
      merged: z.boolean().optional(),
    })
    .optional(),
});
export type GithubEnvelope = z.infer<typeof githubEnvelopeSchema>;

export const jiraEnvelopeSchema = z.looseObject({
  webhookEvent: z.string().min(1),
  timestamp: z.number().optional(),
  issue: z
    .looseObject({
      id: z.string().optional(),
      key: z.string().optional(),
      fields: z
        .looseObject({
          summary: z.string().optional(),
          description: z.unknown().optional(),
        })
        .optional(),
    })
    .optional(),
});
export type JiraEnvelope = z.infer<typeof jiraEnvelopeSchema>;

export const normalizedSignalSchema = z.object({
  provider: providerSchema,
  externalId: z.string().min(1),
  eventType: z.string().min(1),
  title: z.string().min(1).max(MAX_SIGNAL_TITLE_CHARS),
  body: z.string().refine(withinBytes(MAX_SIGNAL_BODY_BYTES), {
    message: `body must be at most ${MAX_SIGNAL_BODY_BYTES} UTF-8 bytes`,
  }),
  url: z.string().nullable(),
  actor: z.string().nullable(),
  occurredAt: z.iso.datetime(),
  correlationKey: z.string().min(1),
  repositoryHint: z.string().nullable(),
});
export type NormalizedSignal = z.infer<typeof normalizedSignalSchema>;

export const webhookAcceptedSchema = z.object({
  accepted: z.literal(true),
  duplicate: z.boolean(),
  issueId: z.string().optional(),
});
export type WebhookAccepted = z.infer<typeof webhookAcceptedSchema>;
