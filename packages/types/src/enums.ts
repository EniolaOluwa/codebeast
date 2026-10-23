import { z } from "zod";

/**
 * Shared enums for every wire contract. These mirror the Prisma enums in
 * `packages/db/prisma/schema.prisma`; a parity test in `apps/api` fails if
 * the two ever drift apart.
 */

export const PROVIDERS = ["SLACK", "SENTRY", "GITHUB", "JIRA"] as const;
export const providerSchema = z.enum(PROVIDERS);
export type Provider = z.infer<typeof providerSchema>;

export const MEMBERSHIP_ROLES = ["OWNER", "ADMIN", "MEMBER"] as const;
export const membershipRoleSchema = z.enum(MEMBERSHIP_ROLES);
export type MembershipRole = z.infer<typeof membershipRoleSchema>;

export const ISSUE_STATUSES = [
  "NEW",
  "TRIAGED",
  /** Computed and validated: awaiting a human (or rule) to ship it. */
  "READY",
  "RUNNING",
  /** Shipped to Jira; the pull request may still be pending. */
  "TICKETED",
  "PR_OPENED",
  "RESOLVED",
  "IGNORED",
  "FAILED",
  "ESCALATED",
] as const;
export const issueStatusSchema = z.enum(ISSUE_STATUSES);
export type IssueStatus = z.infer<typeof issueStatusSchema>;

export const RUN_STATUSES = [
  "QUEUED",
  "PLANNING",
  "CODING",
  "VALIDATING",
  "OPENING_PR",
  "SUCCEEDED",
  "FAILED",
  "ESCALATED",
  "CANCELLED",
] as const;
export const runStatusSchema = z.enum(RUN_STATUSES);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const PATCH_STATUSES = [
  "PENDING",
  "VALIDATED",
  "FAILED",
  "REJECTED",
] as const;
export const patchStatusSchema = z.enum(PATCH_STATUSES);
export type PatchStatus = z.infer<typeof patchStatusSchema>;

export const VALIDATION_STATUSES = ["PASSED", "FAILED", "ERRORED"] as const;
export const validationStatusSchema = z.enum(VALIDATION_STATUSES);
export type ValidationStatus = z.infer<typeof validationStatusSchema>;

export const PULL_REQUEST_STATUSES = ["OPEN", "MERGED", "CLOSED"] as const;
export const pullRequestStatusSchema = z.enum(PULL_REQUEST_STATUSES);
export type PullRequestStatus = z.infer<typeof pullRequestStatusSchema>;

export const WEBHOOK_STATUSES = [
  "RECEIVED",
  "PROCESSED",
  "DUPLICATE",
  "REJECTED",
  "FAILED",
] as const;
export const webhookStatusSchema = z.enum(WEBHOOK_STATUSES);
export type WebhookStatus = z.infer<typeof webhookStatusSchema>;

export const ACTOR_TYPES = ["USER", "API_KEY", "SYSTEM"] as const;
export const actorTypeSchema = z.enum(ACTOR_TYPES);
export type ActorType = z.infer<typeof actorTypeSchema>;

export const API_KEY_SCOPES = [
  "repositories:read",
  "repositories:write",
  "integrations:read",
  "integrations:write",
  "issues:read",
  "issues:write",
  "runs:read",
  "runs:write",
  "members:read",
  "overview:read",
  "audit:read",
] as const;
export const apiKeyScopeSchema = z.enum(API_KEY_SCOPES);
export type ApiKeyScope = z.infer<typeof apiKeyScopeSchema>;
