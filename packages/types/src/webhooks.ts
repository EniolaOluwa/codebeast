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
  event_id: z.string().nullish(),
  team_id: z.string().nullish(),
  event: z
    .looseObject({
      type: z.string(),
      text: z.string().nullish(),
      user: z.string().nullish(),
      channel: z.string().nullish(),
      ts: z.string().nullish(),
      thread_ts: z.string().nullish(),
    })
    .optional(),
});
export type SlackEnvelope = z.infer<typeof slackEnvelopeSchema>;

export const sentryEnvelopeSchema = z.looseObject({
  action: z.string().nullish(),
  installation: z.looseObject({ uuid: z.string().nullish() }).optional(),
  data: z
    .looseObject({
      issue: z
        .looseObject({
          id: z.string().nullish(),
          title: z.string().nullish(),
          culprit: z.string().nullish(),
          permalink: z.string().nullish(),
          project: z
            .looseObject({
              slug: z.string().nullish(),
              name: z.string().nullish(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
});
export type SentryEnvelope = z.infer<typeof sentryEnvelopeSchema>;

export const githubEnvelopeSchema = z.looseObject({
  action: z.string().nullish(),
  installation: z.looseObject({ id: z.number().int().nullish() }).optional(),
  repository: z
    .looseObject({
      full_name: z.string().nullish(),
      default_branch: z.string().nullish(),
    })
    .optional(),
  issue: z
    .looseObject({
      number: z.number().int().nullish(),
      title: z.string().nullish(),
      body: z.string().nullish(),
      html_url: z.string().nullish(),
      user: z.looseObject({ login: z.string().nullish() }).optional(),
    })
    .optional(),
  pull_request: z
    .looseObject({
      number: z.number().int().nullish(),
      title: z.string().nullish(),
      html_url: z.string().nullish(),
      merged: z.boolean().nullish(),
    })
    .optional(),
});
export type GithubEnvelope = z.infer<typeof githubEnvelopeSchema>;

export const jiraEnvelopeSchema = z.looseObject({
  webhookEvent: z.string().min(1),
  timestamp: z.number().nullish(),
  issue: z
    .looseObject({
      id: z.string().nullish(),
      key: z.string().nullish(),
      fields: z
        .looseObject({
          summary: z.string().nullish(),
          description: z.unknown().optional(),
        })
        .optional(),
    })
    .optional(),
});
export type JiraEnvelope = z.infer<typeof jiraEnvelopeSchema>;

export const freshdeskEnvelopeSchema = z.looseObject({
  // Automation webhooks wrap the ticket; some payloads send fields top-level.
  ticket: z
    .looseObject({
      id: z.union([z.number(), z.string()]),
      subject: z.string().nullish(),
      description_text: z.string().nullish(),
      requester: z
        .looseObject({
          name: z.string().nullish(),
          email: z.string().nullish(),
        })
        .nullish(),
      created_at: z.string().nullish(),
    })
    .nullish(),
  id: z.union([z.number(), z.string()]).nullish(),
  subject: z.string().nullish(),
  description_text: z.string().nullish(),
});
export type FreshdeskEnvelope = z.infer<typeof freshdeskEnvelopeSchema>;

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
