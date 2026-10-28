import { z } from "zod";

import {
  IssueSeveritySchema,
  SignalKindSchema,
  WebhookSourceSchema,
} from "./enums.ts";

/**
 * Provider-neutral normalized form every webhook adapter maps into.
 * Keeping ingestion provider-agnostic lets Slack/Zendesk/Sentry/GitHub share
 * one pipeline (see apps/api/decisions.md ADR-006).
 */
export const NormalizedSignalSchema = z.object({
  kind: SignalKindSchema,
  externalId: z.string().min(1),
  title: z.string().nullable(),
  body: z.string().nullable(),
  url: z.string().nullable(),
  severity: IssueSeveritySchema.nullable(),
  repositoryFullName: z.string().nullable(),
  stack: z.string().nullable(),
  fingerprint: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  occurredAt: z.coerce.date(),
});
export type NormalizedSignal = z.infer<typeof NormalizedSignalSchema>;

export const WebhookEnvelopeSchema = z.object({
  source: WebhookSourceSchema,
  integrationId: z.string(),
  externalId: z.string().min(1),
  signal: NormalizedSignalSchema,
});
export type WebhookEnvelope = z.infer<typeof WebhookEnvelopeSchema>;

export const WebhookAckSchema = z.object({
  received: z.boolean(),
  duplicate: z.boolean(),
  webhookEventId: z.string().nullable(),
});
export type WebhookAck = z.infer<typeof WebhookAckSchema>;
