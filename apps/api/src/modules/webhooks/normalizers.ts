import {
  githubEnvelopeSchema,
  jiraEnvelopeSchema,
  MAX_SIGNAL_BODY_BYTES,
  MAX_SIGNAL_TITLE_CHARS,
  type NormalizedSignal,
  normalizedSignalSchema,
  sentryEnvelopeSchema,
  slackEnvelopeSchema,
  truncateToBytes,
} from "@repo/types";

/**
 * Provider payloads → one normalized signal shape. Correlation keys are
 * computed here (not by the model): a Slack message that links a Sentry issue
 * correlates with the Sentry alert for the same issue.
 */

function cut(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

const SENTRY_URL_PATTERN =
  /sentry\.io\/(?:organizations\/[\w-]+\/)?issues\/(\d+)/i;
const GITHUB_ISSUE_URL_PATTERN =
  /github\.com\/([\w.-]+\/[\w.-]+)\/issues\/(\d+)/i;

export interface ReferencedSignal {
  correlationKey: string;
  repositoryHint: string | null;
}

/** Extracts cross-provider references from free text (Slack messages). */
export function referencesFromText(text: string): ReferencedSignal | null {
  const sentry = SENTRY_URL_PATTERN.exec(text);

  if (sentry) {
    return {
      correlationKey: `sentry:issue:${sentry[1]}`,
      repositoryHint: null,
    };
  }

  const github = GITHUB_ISSUE_URL_PATTERN.exec(text);

  if (github) {
    return {
      correlationKey: `github:${github[1]}:issue:${github[2]}`,
      repositoryHint: github[1] ?? null,
    };
  }

  return null;
}

export function normalizeSlack(
  payload: unknown,
  now = new Date(),
): NormalizedSignal {
  const envelope = slackEnvelopeSchema.parse(payload);
  const event = envelope.event;
  const text = event?.text ?? "";

  const reference = referencesFromText(text);

  const correlationKey =
    reference?.correlationKey ??
    `slack:${envelope.team_id ?? "unknown"}:${event?.channel ?? "unknown"}:${
      event?.thread_ts ?? event?.ts ?? "unknown"
    }`;

  const occurredAt = event?.ts
    ? new Date(Number(event.ts) * 1000).toISOString()
    : now.toISOString();

  return normalizedSignalSchema.parse({
    provider: "SLACK",
    externalId: envelope.event_id ?? "unknown",
    eventType: event?.type ?? envelope.type,
    title: cut(text.split("\n")[0] || "Slack message", MAX_SIGNAL_TITLE_CHARS),
    body: truncateToBytes(text, MAX_SIGNAL_BODY_BYTES),
    url: null,
    actor: event?.user ?? null,
    occurredAt,
    correlationKey,
    repositoryHint: reference?.repositoryHint ?? null,
  });
}

export function normalizeSentry(
  payload: unknown,
  now = new Date(),
): NormalizedSignal {
  const envelope = sentryEnvelopeSchema.parse(payload);
  const issue = envelope.data?.issue;

  const correlationKey = issue?.id
    ? `sentry:issue:${issue.id}`
    : `sentry:${issue?.culprit ?? "unknown"}:${issue?.title ?? "unknown"}`;

  return normalizedSignalSchema.parse({
    provider: "SENTRY",
    externalId: issue?.id ?? "unknown",
    eventType: `issue.${envelope.action ?? "unknown"}`,
    title: cut(issue?.title ?? "Sentry issue", MAX_SIGNAL_TITLE_CHARS),
    body: truncateToBytes(
      [
        issue?.culprit ? `culprit: ${issue.culprit}` : null,
        issue?.project?.slug ? `project: ${issue.project.slug}` : null,
        issue?.permalink ?? null,
      ]
        .filter(Boolean)
        .join("\n"),
      MAX_SIGNAL_BODY_BYTES,
    ),
    url: issue?.permalink ?? null,
    actor: null,
    occurredAt: now.toISOString(),
    correlationKey,
    repositoryHint: null,
  });
}

export function normalizeGithub(
  payload: unknown,
  eventName: string | null,
  now = new Date(),
): NormalizedSignal {
  const envelope = githubEnvelopeSchema.parse(payload);
  const repo = envelope.repository?.full_name ?? null;

  if (envelope.issue?.number !== undefined) {
    return normalizedSignalSchema.parse({
      provider: "GITHUB",
      externalId: String(envelope.issue.number),
      eventType: `issues.${envelope.action ?? "unknown"}`,
      title: cut(
        envelope.issue.title ?? "GitHub issue",
        MAX_SIGNAL_TITLE_CHARS,
      ),
      body: truncateToBytes(envelope.issue.body ?? "", MAX_SIGNAL_BODY_BYTES),
      url: envelope.issue.html_url ?? null,
      actor: envelope.issue.user?.login ?? null,
      occurredAt: now.toISOString(),
      correlationKey: `github:${repo ?? "unknown"}:issue:${envelope.issue.number}`,
      repositoryHint: repo,
    });
  }

  if (envelope.pull_request?.number !== undefined) {
    return normalizedSignalSchema.parse({
      provider: "GITHUB",
      externalId: String(envelope.pull_request.number),
      eventType: `pull_request.${envelope.action ?? "unknown"}`,
      title: cut(
        envelope.pull_request.title ?? "GitHub pull request",
        MAX_SIGNAL_TITLE_CHARS,
      ),
      body: "",
      url: envelope.pull_request.html_url ?? null,
      actor: null,
      occurredAt: now.toISOString(),
      correlationKey: `github:${repo ?? "unknown"}:pr:${envelope.pull_request.number}`,
      repositoryHint: repo,
    });
  }

  return normalizedSignalSchema.parse({
    provider: "GITHUB",
    externalId: `${eventName ?? "event"}:${envelope.action ?? "unknown"}`,
    eventType: `${eventName ?? "unknown"}.${envelope.action ?? "unknown"}`,
    title: cut(
      `GitHub ${eventName ?? "event"} on ${repo ?? "unknown"}`,
      MAX_SIGNAL_TITLE_CHARS,
    ),
    body: "",
    url: null,
    actor: null,
    occurredAt: now.toISOString(),
    correlationKey: `github:${repo ?? "unknown"}:${eventName ?? "event"}:${envelope.action ?? "unknown"}`,
    repositoryHint: repo,
  });
}

function jiraDescriptionToText(description: unknown): string {
  if (typeof description === "string") {
    return description;
  }

  if (description && typeof description === "object") {
    return JSON.stringify(description);
  }

  return "";
}

export function normalizeJira(
  payload: unknown,
  now = new Date(),
): NormalizedSignal {
  const envelope = jiraEnvelopeSchema.parse(payload);
  const issue = envelope.issue;
  const summary = issue?.fields?.summary ?? "Jira issue";

  return normalizedSignalSchema.parse({
    provider: "JIRA",
    externalId: issue?.key ?? "unknown",
    eventType: envelope.webhookEvent,
    title: cut(summary, MAX_SIGNAL_TITLE_CHARS),
    body: truncateToBytes(
      jiraDescriptionToText(issue?.fields?.description),
      MAX_SIGNAL_BODY_BYTES,
    ),
    url: null,
    actor: null,
    occurredAt: envelope.timestamp
      ? new Date(envelope.timestamp).toISOString()
      : now.toISOString(),
    correlationKey: `jira:issue:${issue?.key ?? "unknown"}`,
    repositoryHint: null,
  });
}
