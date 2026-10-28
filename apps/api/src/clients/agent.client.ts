import type {
  IssueContext,
  PatchSubmission,
  PlanBlueprint,
  RepositoryCheckout,
  ValidationResult,
} from "@repo/types";

/**
 * The only seam between the API and the reasoning service (ADR-001). Phase 4
 * ships the stub; the real `apps/agent` client swaps in behind this token.
 */

export type AgentFailureKind = "retryable" | "terminal" | "needs_replan";

export interface AgentFailure {
  kind: AgentFailureKind;
  reason: string;
}

export type AgentResult<T> =
  { ok: true; value: T } | { ok: false; failure: AgentFailure };

export interface AgentClient {
  plan(input: {
    context: IssueContext;
    checkout?: RepositoryCheckout;
  }): Promise<AgentResult<PlanBlueprint>>;

  code(input: {
    context: IssueContext;
    plan: PlanBlueprint;
    /** Populated on retries: the validator error from the previous attempt. */
    previousError?: string;
    checkout?: RepositoryCheckout;
  }): Promise<AgentResult<PatchSubmission>>;

  validate(input: {
    patch: PatchSubmission;
    context: IssueContext;
    checkout?: RepositoryCheckout;
  }): Promise<AgentResult<ValidationResult & { sandboxRunId?: string }>>;
}

export const AGENT_CLIENT = Symbol("AGENT_CLIENT");
