import { MAX_SIGNAL_BODY_BYTES } from "@repo/types";
import { describe, expect, it } from "vitest";

import {
  normalizeGithub,
  normalizeJira,
  normalizeSentry,
  normalizeSlack,
  referencesFromText,
} from "./normalizers.ts";

describe("referencesFromText", () => {
  it("finds Sentry issue links", () => {
    expect(
      referencesFromText(
        "This looks like https://sentry.io/organizations/acme/issues/42/ again",
      ),
    ).toEqual({ correlationKey: "sentry:issue:42", repositoryHint: null });
  });

  it("finds GitHub issue links with the repo hint", () => {
    expect(
      referencesFromText("see https://github.com/acme/web/issues/12"),
    ).toEqual({
      correlationKey: "github:acme/web:issue:12",
      repositoryHint: "acme/web",
    });
  });

  it("returns null for plain text", () => {
    expect(referencesFromText("the export button does nothing")).toBeNull();
  });
});

describe("normalizeSlack", () => {
  it("normalizes a plain message with a thread correlation key", () => {
    const signal = normalizeSlack(
      {
        type: "event_callback",
        event_id: "Ev123",
        team_id: "T1",
        event: {
          type: "message",
          text: "Export is broken",
          user: "U1",
          channel: "C1",
          ts: "1700000000.000100",
        },
      },
      new Date("2026-10-23T10:00:00.000Z"),
    );

    expect(signal).toMatchObject({
      provider: "SLACK",
      externalId: "Ev123",
      eventType: "message",
      title: "Export is broken",
      actor: "U1",
      correlationKey: "slack:T1:C1:1700000000.000100",
      repositoryHint: null,
    });
    expect(signal.occurredAt).toBe("2023-11-14T22:13:20.000Z");
  });

  it("correlates a message that links a Sentry issue", () => {
    const signal = normalizeSlack({
      type: "event_callback",
      event_id: "Ev2",
      team_id: "T1",
      event: {
        type: "message",
        text: "still failing https://sentry.io/issues/7/",
        channel: "C1",
        ts: "1700000000.000100",
        thread_ts: "1699999999.000100",
      },
    });

    expect(signal.correlationKey).toBe("sentry:issue:7");
  });

  it("truncates oversized bodies to the contract budget", () => {
    const signal = normalizeSlack({
      type: "event_callback",
      event_id: "Ev3",
      team_id: "T1",
      event: {
        type: "message",
        text: "x".repeat(MAX_SIGNAL_BODY_BYTES + 500),
        channel: "C1",
        ts: "1700000000.000100",
      },
    });

    expect(Buffer.byteLength(signal.body, "utf8")).toBeLessThanOrEqual(
      MAX_SIGNAL_BODY_BYTES,
    );
    expect(signal.title.length).toBeLessThanOrEqual(512);
  });
});

describe("normalizeSentry", () => {
  it("keys by issue id and carries the permalink", () => {
    const signal = normalizeSentry({
      action: "created",
      installation: { uuid: "inst-1" },
      data: {
        issue: {
          id: "42",
          title: "TypeError in export",
          culprit: "src/export.ts",
          permalink: "https://sentry.io/organizations/acme/issues/42/",
          project: { slug: "web" },
        },
      },
    });

    expect(signal).toMatchObject({
      provider: "SENTRY",
      externalId: "42",
      eventType: "issue.created",
      title: "TypeError in export",
      correlationKey: "sentry:issue:42",
      url: "https://sentry.io/organizations/acme/issues/42/",
    });
    expect(signal.body).toContain("culprit: src/export.ts");
  });
});

describe("normalizeGithub", () => {
  it("keys issues by repo + number and hints the repository", () => {
    const signal = normalizeGithub(
      {
        action: "opened",
        installation: { id: 77 },
        repository: { full_name: "acme/web", default_branch: "main" },
        issue: {
          number: 12,
          title: "Export fails",
          body: "Steps: click export",
          html_url: "https://github.com/acme/web/issues/12",
          user: { login: "octocat" },
        },
      },
      "issues",
    );

    expect(signal).toMatchObject({
      provider: "GITHUB",
      externalId: "12",
      eventType: "issues.opened",
      correlationKey: "github:acme/web:issue:12",
      repositoryHint: "acme/web",
      actor: "octocat",
    });
  });

  it("handles pull_request events", () => {
    const signal = normalizeGithub(
      {
        action: "closed",
        repository: { full_name: "acme/web" },
        pull_request: {
          number: 9,
          title: "Fix export",
          html_url: "https://github.com/acme/web/pull/9",
          merged: true,
        },
      },
      "pull_request",
    );

    expect(signal.correlationKey).toBe("github:acme/web:pr:9");
  });
});

describe("normalizeJira", () => {
  it("normalizes an issue webhook with a timestamp", () => {
    const signal = normalizeJira({
      webhookEvent: "jira:issue_created",
      timestamp: 1700000000000,
      issue: {
        id: "10001",
        key: "SUP-1",
        fields: {
          summary: "Export button does nothing",
          description: "Steps to reproduce...",
        },
      },
    });

    expect(signal).toMatchObject({
      provider: "JIRA",
      externalId: "SUP-1",
      eventType: "jira:issue_created",
      title: "Export button does nothing",
      correlationKey: "jira:issue:SUP-1",
      occurredAt: "2023-11-14T22:13:20.000Z",
    });
  });
});
