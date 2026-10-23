import {
  ActorType as PrismaActorType,
  IssueStatus as PrismaIssueStatus,
  MembershipRole as PrismaMembershipRole,
  PatchStatus as PrismaPatchStatus,
  Provider as PrismaProvider,
  PullRequestStatus as PrismaPullRequestStatus,
  RunStatus as PrismaRunStatus,
  ValidationStatus as PrismaValidationStatus,
  WebhookStatus as PrismaWebhookStatus,
} from "@repo/db";
import {
  ACTOR_TYPES,
  ISSUE_STATUSES,
  MEMBERSHIP_ROLES,
  PATCH_STATUSES,
  PROVIDERS,
  PULL_REQUEST_STATUSES,
  RUN_STATUSES,
  VALIDATION_STATUSES,
  WEBHOOK_STATUSES,
} from "@repo/types";
import { describe, expect, it } from "vitest";

/**
 * The wire contracts in `@repo/types` must stay in lock-step with the Prisma
 * enums — a migration that adds a value without the contract (or vice versa)
 * fails here instead of in production.
 */
const PAIRS: [string, readonly string[], Record<string, string>][] = [
  ["Provider", PROVIDERS, PrismaProvider],
  ["MembershipRole", MEMBERSHIP_ROLES, PrismaMembershipRole],
  ["IssueStatus", ISSUE_STATUSES, PrismaIssueStatus],
  ["RunStatus", RUN_STATUSES, PrismaRunStatus],
  ["PatchStatus", PATCH_STATUSES, PrismaPatchStatus],
  ["ValidationStatus", VALIDATION_STATUSES, PrismaValidationStatus],
  ["PullRequestStatus", PULL_REQUEST_STATUSES, PrismaPullRequestStatus],
  ["WebhookStatus", WEBHOOK_STATUSES, PrismaWebhookStatus],
  ["ActorType", ACTOR_TYPES, PrismaActorType],
];

describe("contract parity: @repo/types enums vs Prisma enums", () => {
  it.each(PAIRS)("%s matches", (_name, contract, prisma) => {
    expect([...contract].sort()).toEqual(Object.values(prisma).sort());
  });
});
