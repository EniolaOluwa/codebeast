import {
  freshdeskEnvelopeSchema,
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

// --- Discord (scanned messages; no inbound webhooks) ------------------------

export interface DiscordMessageInput {
  id: string;
  content: string;
  author: { id: string; username: string; bot?: boolean | null };
  timestamp: string;
  channelId: string;
}

export function discordMessageToSignal(
  message: DiscordMessageInput,
  context: { guildId: string | null },
): NormalizedSignal {
  const text = message.content ?? "";
  const reference = referencesFromText(text);

  return normalizedSignalSchema.parse({
    provider: "DISCORD",
    externalId: message.id,
    eventType: "message.create",
    title: cut(
      text.split("\n")[0] || "Discord message",
      MAX_SIGNAL_TITLE_CHARS,
    ),
    body: truncateToBytes(text, MAX_SIGNAL_BODY_BYTES),
    url: null,
    actor: message.author?.username ?? null,
    occurredAt: message.timestamp
      ? new Date(message.timestamp).toISOString()
      : new Date().toISOString(),
    correlationKey:
      reference?.correlationKey ??
      `discord:${context.guildId ?? "dm"}:${message.channelId}:${message.id}`,
    repositoryHint: reference?.repositoryHint ?? null,
  });
}

// --- Freshdesk (webhook + scan) ---------------------------------------------

export interface FreshdeskTicketInput {
  id: number | string;
  subject?: string | null;
  description_text?: string | null;
  requester?: { name?: string | null; email?: string | null } | null;
  created_at?: string | null;
}

/** Accepts both automation shapes: `{ ticket: {...} }` and top-level fields. */
export function freshdeskEnvelopeToTicket(
  payload: unknown,
): FreshdeskTicketInput | null {
  const envelope = freshdeskEnvelopeSchema.safeParse(payload);

  if (!envelope.success) {
    return null;
  }

  if (envelope.data.ticket?.id !== undefined) {
    return envelope.data.ticket;
  }

  const topLevelId = envelope.data.id ?? undefined;

  if (topLevelId !== undefined) {
    return {
      id: topLevelId,
      subject: envelope.data.subject,
      description_text: envelope.data.description_text,
    };
  }

  return null;
}

export function freshdeskTicketToSignal(
  ticket: FreshdeskTicketInput,
  context: { domain: string },
): NormalizedSignal {
  const id = String(ticket.id);
  const title = ticket.subject?.trim() || `Freshdesk conversation #${id}`;
  const description = ticket.description_text ?? "";
  // A conversation that quotes a Sentry/GitHub link joins that report.
  const reference = referencesFromText(description);

  return normalizedSignalSchema.parse({
    provider: "FRESHDESK",
    externalId: id,
    eventType: "conversation.create",
    title: cut(title, MAX_SIGNAL_TITLE_CHARS),
    body: truncateToBytes(
      [title, description].filter(Boolean).join("\n\n"),
      MAX_SIGNAL_BODY_BYTES,
    ),
    url: `https://${context.domain}/a/tickets/${id}`,
    actor: ticket.requester?.email ?? ticket.requester?.name ?? null,
    occurredAt: ticket.created_at
      ? new Date(ticket.created_at).toISOString()
      : new Date().toISOString(),
    correlationKey: reference?.correlationKey ?? `freshdesk:ticket:${id}`,
    repositoryHint: reference?.repositoryHint ?? null,
  });
}
