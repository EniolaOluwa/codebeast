import { z } from "zod";

import {
  IssueSeveritySchema,
  IssueStatusSchema,
  SignalKindSchema,
} from "./enums.ts";

export const IssueSignalSchema = z.object({
  id: z.string(),
  kind: SignalKindSchema,
  externalId: z.string(),
  source: z.string(),
  title: z.string().nullable(),
  body: z.string().nullable(),
  url: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  occurredAt: z.coerce.date(),
});
export type IssueSignal = z.infer<typeof IssueSignalSchema>;

export const IssueSchema = z.object({
  id: z.string(),
  tenantId: z.uuid(),
  repositoryId: z.string().nullable(),
  title: z.string(),
  summary: z.string().nullable(),
  status: IssueStatusSchema,
  severity: IssueSeveritySchema,
  correlationScore: z.number(),
  primarySignal: SignalKindSchema.nullable(),
  sentryIssueId: z.string().nullable(),
  jiraKey: z.string().nullable(),
  firstSeenAt: z.coerce.date(),
  lastSeenAt: z.coerce.date(),
  resolvedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Issue = z.infer<typeof IssueSchema>;

export const RepositoryRefSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  defaultBranch: z.string(),
  provider: z.string(),
});

/**
 * The complete, self-contained context handed to the agent for a single issue.
 * Defined here so API and agent share a single source of truth (root AGENTS.md §3).
 */
export const IssueContextSchema = z.object({
  issueId: z.string(),
  tenantId: z.uuid(),
  title: z.string(),
  summary: z.string().nullable(),
  severity: IssueSeveritySchema,
  correlationScore: z.number(),
  repository: RepositoryRefSchema,
  signals: z.array(IssueSignalSchema).min(1),
  sentryStack: z.string().nullable(),
  jiraKey: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type IssueContext = z.infer<typeof IssueContextSchema>;
