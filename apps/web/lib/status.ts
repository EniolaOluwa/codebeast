import type { IssueStatus, PullRequestStatus } from "@repo/types";

import type { BadgeTone } from "@/components/ui/badge";

export interface StatusChip {
  label: string;
  tone: BadgeTone;
}

/** design.md §8.2 status values, derived from issue + PR state. */
export function reportChip(
  status: IssueStatus,
  pullRequest?: { status: PullRequestStatus } | null,
): StatusChip {
  switch (status) {
    case "READY":
    case "TRIAGED":
      return { label: "Needs review", tone: "warning" };
    case "ESCALATED":
      return { label: "Needs review", tone: "danger" };
    case "TICKETED":
      return { label: "Ticket created", tone: "info" };
    case "PR_OPENED":
      if (pullRequest?.status === "MERGED") {
        return { label: "Merged", tone: "success" };
      }
      if (pullRequest?.status === "CLOSED") {
        return { label: "PR closed", tone: "neutral" };
      }
      return { label: "PR open", tone: "info" };
    case "RESOLVED":
      return { label: "Resolved", tone: "success" };
    case "IGNORED":
      return { label: "Ignored", tone: "neutral" };
    case "FAILED":
      return { label: "Failed", tone: "danger" };
    case "NEW":
    case "RUNNING":
      return { label: "In progress", tone: "info" };
  }
}

export function pullRequestChip(status: PullRequestStatus): StatusChip {
  switch (status) {
    case "OPEN":
      return { label: "Open", tone: "info" };
    case "MERGED":
      return { label: "Merged", tone: "success" };
    case "CLOSED":
      return { label: "Closed", tone: "neutral" };
  }
}

export function validationChip(
  status: "PASSED" | "FAILED" | "ERRORED",
): StatusChip {
  switch (status) {
    case "PASSED":
      return { label: "Validated", tone: "success" };
    case "FAILED":
      return { label: "Validation failed", tone: "danger" };
    case "ERRORED":
      return { label: "Validator errored", tone: "warning" };
  }
}

/** Severity placeholder until detection rules land (Phase 8). */
export function severityChip(signalCount: number): StatusChip {
  if (signalCount >= 3) {
    return { label: "High", tone: "warning" };
  }

  return { label: "Medium", tone: "info" };
}
