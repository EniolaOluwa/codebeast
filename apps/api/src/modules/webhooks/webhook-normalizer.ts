import { Injectable } from "@nestjs/common";
import type {
  IssueSeverity,
  NormalizedSignal,
  WebhookSource,
} from "@repo/types";

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json {
  return value !== null && typeof value === "object" ? (value as Json) : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function sentrySeverity(level: unknown): IssueSeverity {
  switch (level) {
    case "fatal":
      return "CRITICAL";
    case "error":
      return "HIGH";
    case "warning":
      return "MEDIUM";
    default:
      return "LOW";
  }
}

function jiraSeverity(priority: unknown): IssueSeverity {
  switch (priority) {
    case "Highest":
    case "Critical":
      return "CRITICAL";
    case "High":
      return "HIGH";
    case "Low":
    case "Lowest":
      return "LOW";
    default:
      return "MEDIUM";
  }
}

export interface NormalizedWebhook {
  externalId: string;
  signal: NormalizedSignal | null;
  ignoredReason?: string;
}

/**
 * Maps provider payloads into the provider-neutral NormalizedSignal. Returning
 * `signal: null` means the webhook is acknowledged but does not represent a
 * triageable signal (e.g. GitHub PR state changes handled separately).
 */
@Injectable()
export class WebhookNormalizer {
  normalize(source: WebhookSource, payload: Json): NormalizedWebhook {
    switch (source) {
      case "SENTRY":
        return this.normalizeSentry(payload);
      case "JIRA":
        return this.normalizeJira(payload);
      case "SLACK":
        return this.normalizeSlack(payload);
      case "GITHUB":
        return this.normalizeGithub(payload);
      default:
        return {
          externalId: "",
          signal: null,
          ignoredReason: "unknown source",
        };
    }
  }

  private normalizeSentry(payload: Json): NormalizedWebhook {
    const data = asRecord(payload.data);
    const event = asRecord(data.event);
    const issue = asRecord(data.issue);

    const externalId =
      asString(event.event_id) ??
      asString(issue.id) ??
      asString(payload.id) ??
      `sentry-${Date.now()}`;

    const title =
      asString(issue.title) ??
      asString(event.title) ??
      asString(event.message) ??
      "Sentry error";

    return {
      externalId,
      signal: {
        kind: "SENTRY_EVENT",
        externalId,
        title,
        body: asString(event.message) ?? asString(issue.culprit),
        url: asString(issue.web_url) ?? asString(event.web_url),
        severity: sentrySeverity(issue.level ?? event.level),
        repositoryFullName: this.extractRepo(
          asString(event.culprit) ?? asString(payload.culprit),
        ),
        stack: asString(event.stacktrace) ?? asString(event.culprit),
        fingerprint: asString(issue.id) ?? asString(issue.shortId),
        metadata: { issue, event },
        occurredAt: new Date(),
      },
    };
  }

  private normalizeJira(payload: Json): NormalizedWebhook {
    const issue = asRecord(payload.issue);
    const fields = asRecord(issue.fields);
    const externalId =
      asString(issue.key) ?? asString(issue.id) ?? `jira-${Date.now()}`;

    return {
      externalId,
      signal: {
        kind: "JIRA_TICKET",
        externalId,
        title: asString(fields.summary) ?? externalId,
        body:
          typeof fields.description === "string"
            ? fields.description
            : JSON.stringify(fields.description ?? ""),
        url: asString(issue.self),
        severity: jiraSeverity(asRecord(fields.priority).name),
        repositoryFullName: null,
        stack: null,
        fingerprint: null,
        metadata: { issueKey: externalId },
        occurredAt: new Date(),
      },
    };
  }

  private normalizeSlack(payload: Json): NormalizedWebhook {
    const event = asRecord(payload.event);
    const externalId =
      asString(event.client_msg_id) ??
      `${asString(event.channel) ?? "channel"}:${asString(event.ts) ?? Date.now()}`;

    const text = asString(event.text) ?? "";
    return {
      externalId,
      signal: {
        kind: "CUSTOMER_MESSAGE",
        externalId,
        title: text.slice(0, 80) || "Customer message",
        body: text,
        url: null,
        severity: "MEDIUM",
        repositoryFullName: null,
        stack: null,
        fingerprint: null,
        metadata: {
          channel: asString(event.channel),
          user: asString(event.user),
          team: asString(payload.team_id),
          threadTs: asString(event.thread_ts),
        },
        occurredAt: new Date(),
      },
    };
  }

  private normalizeGithub(payload: Json): NormalizedWebhook {
    const action = asString(payload.action);
    const pull = asRecord(payload.pull_request);
    const externalId =
      asString(pull.id) ?? asString(payload.after) ?? `github-${Date.now()}`;

    return {
      externalId,
      signal: null,
      ignoredReason: `GitHub ${action ?? "event"} is handled as PR state, not a signal`,
    };
  }

  private extractRepo(value: string | null): string | null {
    if (!value) {
      return null;
    }
    const match = value.match(/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/);
    return match?.[1] ?? null;
  }
}
