import { z } from "zod";

export const RoleSchema = z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER"]);
export type Role = z.infer<typeof RoleSchema>;

export const ApiKeyScopeSchema = z.enum([
  "issues:read",
  "issues:write",
  "runs:read",
  "runs:write",
  "repositories:read",
  "repositories:write",
  "integrations:read",
  "integrations:write",
  "audit:read",
  "admin",
]);
export type ApiKeyScope = z.infer<typeof ApiKeyScopeSchema>;

export const IntegrationTypeSchema = z.enum([
  "SENTRY",
  "JIRA",
  "GITHUB",
  "SLACK",
]);
export type IntegrationType = z.infer<typeof IntegrationTypeSchema>;

export const IntegrationStatusSchema = z.enum([
  "CONNECTED",
  "DISCONNECTED",
  "ERROR",
]);
export type IntegrationStatus = z.infer<typeof IntegrationStatusSchema>;

export const RepositoryProviderSchema = z.enum(["GITHUB", "GITLAB"]);
export type RepositoryProvider = z.infer<typeof RepositoryProviderSchema>;

export const IssueStatusSchema = z.enum([
  "TRIAGED",
  "PLANNING",
  "CODING",
  "VALIDATING",
  "PR_OPENED",
  "RESOLVED",
  "NEEDS_HUMAN",
  "FAILED",
  "IGNORED",
]);
export type IssueStatus = z.infer<typeof IssueStatusSchema>;

export const IssueSeveritySchema = z.enum([
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);
export type IssueSeverity = z.infer<typeof IssueSeveritySchema>;

export const SignalKindSchema = z.enum([
  "SENTRY_EVENT",
  "CUSTOMER_MESSAGE",
  "JIRA_TICKET",
]);
export type SignalKind = z.infer<typeof SignalKindSchema>;

export const RunStatusSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "ESCALATED",
  "CANCELLED",
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const RunStageSchema = z.enum([
  "PLANNING",
  "CODING",
  "VALIDATING",
  "PR",
]);
export type RunStage = z.infer<typeof RunStageSchema>;

export const ValidationStatusSchema = z.enum([
  "PENDING",
  "PASSED",
  "FAILED",
  "ERROR",
]);
export type ValidationStatus = z.infer<typeof ValidationStatusSchema>;

export const PullRequestStatusSchema = z.enum([
  "DRAFT",
  "OPEN",
  "MERGED",
  "CLOSED",
]);
export type PullRequestStatus = z.infer<typeof PullRequestStatusSchema>;

export const WebhookSourceSchema = z.enum([
  "SENTRY",
  "JIRA",
  "GITHUB",
  "SLACK",
]);
export type WebhookSource = z.infer<typeof WebhookSourceSchema>;

export const WebhookEventStatusSchema = z.enum([
  "RECEIVED",
  "PROCESSED",
  "FAILED",
  "IGNORED",
]);
export type WebhookEventStatus = z.infer<typeof WebhookEventStatusSchema>;

export const ActorTypeSchema = z.enum(["USER", "API_KEY", "SYSTEM"]);
export type ActorType = z.infer<typeof ActorTypeSchema>;

export const RunOutcomeSchema = z.enum([
  "SUCCEEDED",
  "FAILED",
  "NEEDS_HUMAN",
  "ESCALATED",
]);
export type RunOutcome = z.infer<typeof RunOutcomeSchema>;
