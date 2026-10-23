import { describe, expect, it } from "vitest";

import { truncateToBytes } from "./text.ts";
import {
  githubEnvelopeSchema,
  jiraEnvelopeSchema,
  normalizedSignalSchema,
  sentryEnvelopeSchema,
  slackEnvelopeSchema,
} from "./webhooks.ts";

describe("provider envelopes", () => {
  it("parses a Slack event callback and ignores unknown fields", () => {
    const parsed = slackEnvelopeSchema.parse({
      type: "event_callback",
      event_id: "Ev123",
      team_id: "T123",
      extra_field: "ignored",
      event: {
        type: "message",
        text: "Export is broken",
        channel: "C123",
        ts: "1690000000.000100",
        blocks: [],
      },
    });
    expect(parsed.event_id).toBe("Ev123");
    expect(parsed.event?.text).toBe("Export is broken");
  });

  it("parses a Sentry issue alert", () => {
    const parsed = sentryEnvelopeSchema.parse({
      action: "created",
      installation: { uuid: "inst-1" },
      data: {
        issue: {
          id: "42",
          title: "TypeError",
          culprit: "src/export.ts",
          permalink: "https://sentry.io/organizations/acme/issues/42/",
          project: { slug: "web" },
        },
      },
    });
    expect(parsed.data?.issue?.id).toBe("42");
  });

  it("parses a GitHub issues webhook", () => {
    const parsed = githubEnvelopeSchema.parse({
      action: "opened",
      installation: { id: 77 },
      repository: { full_name: "acme/web", default_branch: "main" },
      issue: {
        number: 12,
        title: "Export fails",
        body: "Steps to reproduce...",
        html_url: "https://github.com/acme/web/issues/12",
        user: { login: "octocat" },
      },
    });
    expect(parsed.issue?.number).toBe(12);
    expect(parsed.repository?.full_name).toBe("acme/web");
  });

  it("parses a Jira issue webhook", () => {
    const parsed = jiraEnvelopeSchema.parse({
      webhookEvent: "jira:issue_created",
      timestamp: 1690000000000,
      issue: {
        id: "10001",
        key: "SUP-1",
        fields: { summary: "Export button does nothing" },
      },
    });
    expect(parsed.issue?.key).toBe("SUP-1");
  });

  it("rejects a Jira payload without an event type", () => {
    expect(jiraEnvelopeSchema.safeParse({}).success).toBe(false);
  });
});

describe("normalized signal", () => {
  const signal = {
    provider: "GITHUB",
    externalId: "delivery-1",
    eventType: "issues.opened",
    title: "Export fails",
    body: "Steps to reproduce...",
    url: "https://github.com/acme/web/issues/12",
    actor: "octocat",
    occurredAt: "2026-10-23T10:00:00.000Z",
    correlationKey: "github:acme/web:issue:12",
    repositoryHint: "acme/web",
  };

  it("accepts a valid signal", () => {
    expect(normalizedSignalSchema.parse(signal).correlationKey).toBe(
      "github:acme/web:issue:12",
    );
  });

  it("rejects an oversized body even after truncation is possible", () => {
    const oversized = "x".repeat(32_769);
    expect(
      normalizedSignalSchema.safeParse({ ...signal, body: oversized }).success,
    ).toBe(false);
    expect(
      normalizedSignalSchema.safeParse({
        ...signal,
        body: truncateToBytes(oversized, 32_768),
      }).success,
    ).toBe(true);
  });
});
