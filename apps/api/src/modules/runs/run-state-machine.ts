import { canTransition, MAX_REPLANS, type RunStatus } from "@repo/types";

/**
 * Pure run-state accounting (root `AGENTS.md` §6.4): up to `maxAttempts`
 * attempts shared across stages, at most `MAX_REPLANS` replans, then escalate.
 * Legal transitions live in `@repo/types`; this module only decides where a
 * stage outcome takes the run and never touches the database.
 */

export interface RunState {
  status: RunStatus;
  attempt: number;
  maxAttempts: number;
  replans: number;
}

export type StageResult = "passed" | "retryable" | "needs_replan" | "failed";

export interface TransitionDecision {
  next: RunStatus;
  attempt: number;
  replans: number;
  reason?: string;
}

const NEXT_AFTER_PASS: Partial<Record<RunStatus, RunStatus>> = {
  PLANNING: "CODING",
  CODING: "VALIDATING",
  // Compute ends here; shipping (Jira/GitHub writes) is a separate action.
  VALIDATING: "SUCCEEDED",
};

export interface StageOptions {
  /**
   * Where a retryable failure goes. Defaults to the same stage; validator
   * failures set `CODING` (root AGENTS.md §6.3 — same plan, error appended).
   */
  retryTo?: RunStatus;
  reason?: string;
}

export function decideAfterStage(
  run: RunState,
  stage: RunStatus,
  result: StageResult,
  options: StageOptions = {},
): TransitionDecision {
  const escalate = (reason: string): TransitionDecision => {
    assertTransition(stage, "ESCALATED");

    return {
      next: "ESCALATED",
      attempt: run.attempt,
      replans: run.replans,
      reason,
    };
  };

  switch (result) {
    case "passed": {
      const next = NEXT_AFTER_PASS[stage];

      if (!next) {
        throw new Error(`No pass transition is defined from ${stage}`);
      }

      assertTransition(stage, next);

      return { next, attempt: run.attempt, replans: run.replans };
    }

    case "retryable": {
      const next = options.retryTo ?? stage;

      assertTransition(stage, next);

      if (run.attempt + 1 > run.maxAttempts) {
        return escalate(options.reason ?? "attempt budget exhausted");
      }

      return { next, attempt: run.attempt + 1, replans: run.replans };
    }

    case "needs_replan": {
      assertTransition(stage, "PLANNING");

      if (run.replans + 1 > MAX_REPLANS || run.attempt + 1 > run.maxAttempts) {
        return escalate(options.reason ?? "replan budget exhausted");
      }

      return {
        next: "PLANNING",
        attempt: run.attempt + 1,
        replans: run.replans + 1,
      };
    }

    case "failed": {
      assertTransition(stage, "FAILED");

      return {
        next: "FAILED",
        attempt: run.attempt,
        replans: run.replans,
        reason: options.reason,
      };
    }
  }
}

/** The first hop: a freshly created run starts planning at attempt 1. */
export function beginRun(): { status: RunStatus; attempt: number } {
  assertTransition("QUEUED", "PLANNING");

  return { status: "PLANNING", attempt: 1 };
}

export const TERMINAL_RUN_STATUSES = [
  "SUCCEEDED",
  "FAILED",
  "ESCALATED",
  "CANCELLED",
] as const;

export function isTerminal(status: RunStatus): boolean {
  return (TERMINAL_RUN_STATUSES as readonly RunStatus[]).includes(status);
}

function assertTransition(from: RunStatus, to: RunStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal run transition: ${from} -> ${to}`);
  }
}
