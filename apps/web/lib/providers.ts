import type { Provider } from "@repo/types";

export const PROVIDER_LABELS: Record<Provider, string> = {
  SLACK: "Slack",
  SENTRY: "Sentry",
  GITHUB: "GitHub",
  JIRA: "Jira",
  DISCORD: "Discord",
  FRESHDESK: "Freshdesk",
};

/** design.md §8.4 launch sources (all connectable since Phase 7). */
export const SOURCE_TYPES: Provider[] = [
  "SENTRY",
  "SLACK",
  "DISCORD",
  "FRESHDESK",
  "JIRA",
  "GITHUB",
];

/** Sources that expose a backfill scan (mirrors the API's SCANNABLE_PROVIDERS). */
export const SCANNABLE_TYPES: Provider[] = ["JIRA", "DISCORD", "FRESHDESK"];

export const ISSUE_STATUS_FILTERS: {
  value: string;
  label: string;
}[] = [
  { value: "", label: "All statuses" },
  { value: "READY", label: "Needs review" },
  { value: "TICKETED", label: "Ticket created" },
  { value: "PR_OPENED", label: "PR open" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "IGNORED", label: "Ignored" },
  { value: "FAILED", label: "Failed" },
  { value: "ESCALATED", label: "Escalated" },
];
