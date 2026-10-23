import type { Provider } from "@repo/types";

export const PROVIDER_LABELS: Record<Provider, string> = {
  SLACK: "Slack",
  SENTRY: "Sentry",
  GITHUB: "GitHub",
  JIRA: "Jira",
};

/** design.md §8.4 launch sources; the rest are "Coming soon". */
export const SOURCE_TYPES: Provider[] = ["SENTRY", "SLACK", "JIRA", "GITHUB"];
export const COMING_SOON_SOURCES = ["Discord", "Freshdesk"];

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
