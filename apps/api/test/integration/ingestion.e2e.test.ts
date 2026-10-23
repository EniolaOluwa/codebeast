import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { SignalEnricher } from "../../src/modules/triage/enrichment.service.ts";
import { SIGNAL_ENRICHERS } from "../../src/modules/triage/enrichment.service.ts";
import {
  QUEUE_PUBLISHER,
  type QueueJobPayloads,
  type QueueName,
  type QueuePublisher,
} from "../../src/queues/queue.types.ts";
import {
  githubSignature,
  sentrySignature,
  slackSignature,
} from "../../src/modules/webhooks/signatures.ts";
import { createTestApp } from "../support/app.ts";
import { getTestDatabase, type TestDatabase } from "../support/database.ts";
import { dockerAvailable } from "../support/docker.ts";
import { uniqueSuffix } from "../support/factories.ts";

interface RecordedPublish {
  queue: QueueName;
  payload: unknown;
}

class RecordingPublisher implements QueuePublisher {
  readonly publishes: RecordedPublish[] = [];

  async publish<Q extends QueueName>(
    queue: Q,
    payload: QueueJobPayloads[Q],
  ): Promise<void> {
    this.publishes.push({ queue, payload });
  }
}

/**
 * Phase 3 acceptance gate: repository/integration CRUD, all four webhook
 * providers with signature verification, duplicate deliveries producing a
 * single event, cross-provider correlation onto one issue, and lazy
 * (once-per-snapshot) enrichment.
 */
describe.runIf(dockerAvailable)("ingestion (e2e)", () => {
  let db: TestDatabase;
  let app: NestFastifyApplication;

  const publisher = new RecordingPublisher();
  const enricherCalls: string[] = [];

  const fakeEnricher: SignalEnricher = {
    provider: "SENTRY",
    async enrich({ externalId }) {
      enricherCalls.push(externalId);
      return { sentry: { stackTrace: "fake stack trace" } };
    },
  };

  beforeAll(async () => {
    db = await getTestDatabase();
    app = await createTestApp({
      client: db.app,
      override: (builder) =>
        builder
          .overrideProvider(QUEUE_PUBLISHER)
          .useValue(publisher)
          .overrideProvider(SIGNAL_ENRICHERS)
          .useValue([fakeEnricher]),
    });
  });

  afterAll(async () => {
    await app.close();
    await db.admin.$disconnect();
    await db.app.$disconnect();
  });

  async function registerTenant(): Promise<{
    accessToken: string;
    auth: { authorization: string };
  }> {
    const email = `${uniqueSuffix("ingest")}@example.com`;

    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { email, password: "password123" },
    });

    expect(res.statusCode).toBe(201);
    const accessToken: string = res.json().accessToken;

    return { accessToken, auth: { authorization: `Bearer ${accessToken}` } };
  }

  async function createIntegration(
    auth: Record<string, string>,
    payload: Record<string, unknown>,
  ): Promise<{ id: string }> {
    const res = await app.inject({
      method: "POST",
      url: "/v1/integrations",
      headers: auth,
      payload,
    });

    expect(res.statusCode).toBe(201);
    return res.json();
  }

  function signedSlackRequest(
    teamId: string,
    body: unknown,
    secret: string,
  ): { raw: string; headers: Record<string, string> } {
    const raw = JSON.stringify(body);
    const timestamp = String(Math.floor(Date.now() / 1000));

    return {
      raw,
      headers: {
        "content-type": "application/json",
        "x-slack-request-timestamp": timestamp,
        "x-slack-signature": slackSignature(secret, timestamp, raw),
      },
    };
  }

  it("manages repositories", async () => {
    const { auth } = await registerTenant();

    const created = await app.inject({
      method: "POST",
      url: "/v1/repositories",
      headers: auth,
      payload: { name: "web", fullName: "acme/web" },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      name: "web",
      fullName: "acme/web",
      defaultBranch: "main",
    });

    const duplicate = await app.inject({
      method: "POST",
      url: "/v1/repositories",
      headers: auth,
      payload: { name: "web-copy", fullName: "acme/web" },
    });
    expect(duplicate.statusCode).toBe(409);

    const updated = await app.inject({
      method: "PATCH",
      url: `/v1/repositories/${created.json().id}`,
      headers: auth,
      payload: { defaultBranch: "develop" },
    });
    expect(updated.json().defaultBranch).toBe("develop");

    const list = await app.inject({
      method: "GET",
      url: "/v1/repositories",
      headers: auth,
    });
    expect(list.json().pagination.total).toBe(1);

    const missing = await app.inject({
      method: "GET",
      url: "/v1/repositories/does-not-exist",
      headers: auth,
    });
    expect(missing.statusCode).toBe(404);
  });

  it("ingests a signed Slack event, dedupes replays and rejects bad signatures", async () => {
    const { auth } = await registerTenant();
    const secret = "whsec_slack_test";

    const integration = await createIntegration(auth, {
      type: "SLACK",
      name: "support",
      externalId: "T1",
      secrets: { signingSecret: secret },
    });
    expect(integration.id).toBeTruthy();

    const body = {
      type: "event_callback",
      event_id: `Ev_${uniqueSuffix("slack")}`,
      team_id: "T1",
      event: {
        type: "message",
        text: "CSV export is broken since yesterday",
        user: "U1",
        channel: "C1",
        ts: String(Date.now() / 1000),
      },
    };

    const { raw, headers } = signedSlackRequest("T1", body, secret);
    const publishesBefore = publisher.publishes.length;

    const first = await app.inject({
      method: "POST",
      url: "/v1/webhooks/slack",
      headers,
      payload: raw,
    });
    expect(first.statusCode).toBe(202);
    expect(first.json()).toMatchObject({ accepted: true, duplicate: false });
    expect(first.json().issueId).toBeTruthy();

    // Identical replay: one WebhookEvent, one issue, no extra publish.
    const replay = await app.inject({
      method: "POST",
      url: "/v1/webhooks/slack",
      headers,
      payload: raw,
    });
    expect(replay.statusCode).toBe(202);
    expect(replay.json()).toMatchObject({ accepted: true, duplicate: true });

    expect(publisher.publishes.length - publishesBefore).toBe(1);
    const publish = publisher.publishes.at(-1)!;
    expect(publish.queue).toBe("ingest");
    expect(publish.payload).toMatchObject({
      issueId: first.json().issueId,
    });

    const issues = await app.inject({
      method: "GET",
      url: "/v1/issues",
      headers: auth,
    });
    expect(issues.json().pagination.total).toBe(1);

    const detail = await app.inject({
      method: "GET",
      url: `/v1/issues/${first.json().issueId}`,
      headers: auth,
    });
    expect(detail.json().signals).toHaveLength(1);

    // Tampered payload → 401, no writes.
    const tampered = await app.inject({
      method: "POST",
      url: "/v1/webhooks/slack",
      headers,
      payload: `${raw} `,
    });
    expect(tampered.statusCode).toBe(401);
    expect(tampered.json()).toMatchObject({
      success: false,
      error: { code: "UNAUTHORIZED" },
    });

    // Unknown workspace → 404.
    const unknown = await app.inject({
      method: "POST",
      url: "/v1/webhooks/slack",
      headers,
      payload: raw.replace('"T1"', '"T999"'),
    });
    // (signature no longer matches either — both are acceptable, 4xx.)
    expect([401, 404]).toContain(unknown.statusCode);
  });

  it("correlates a Slack message referencing a Sentry issue onto one issue", async () => {
    const { auth } = await registerTenant();
    const sentrySecret = "whsec_sentry_test";
    const slackSecret = "whsec_slack_ref";

    await createIntegration(auth, {
      type: "SENTRY",
      name: "errors",
      externalId: "inst-1",
      secrets: { signingSecret: sentrySecret },
    });
    await createIntegration(auth, {
      type: "SLACK",
      name: "support",
      externalId: "T2",
      secrets: { signingSecret: slackSecret },
    });

    const sentryRaw = JSON.stringify({
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

    const sentry = await app.inject({
      method: "POST",
      url: "/v1/webhooks/sentry",
      headers: {
        "content-type": "application/json",
        "sentry-hook-signature": sentrySignature(sentrySecret, sentryRaw),
      },
      payload: sentryRaw,
    });
    expect(sentry.statusCode).toBe(202);
    const issueId: string = sentry.json().issueId;

    const slack = signedSlackRequest(
      "T2",
      {
        type: "event_callback",
        event_id: `Ev_${uniqueSuffix("ref")}`,
        team_id: "T2",
        event: {
          type: "message",
          text: "Customer report: https://sentry.io/organizations/acme/issues/42/",
          channel: "C9",
          ts: String(Date.now() / 1000),
        },
      },
      slackSecret,
    );

    const slackRes = await app.inject({
      method: "POST",
      url: "/v1/webhooks/slack",
      headers: slack.headers,
      payload: slack.raw,
    });
    expect(slackRes.statusCode).toBe(202);
    expect(slackRes.json().issueId).toBe(issueId);

    const issues = await app.inject({
      method: "GET",
      url: "/v1/issues",
      headers: auth,
    });
    expect(issues.json().pagination.total).toBe(1);

    const detail = await app.inject({
      method: "GET",
      url: `/v1/issues/${issueId}`,
      headers: auth,
    });
    expect(
      detail.json().signals.map((s: { provider: string }) => s.provider),
    ).toEqual(["SENTRY", "SLACK"]);
  });

  it("ingests GitHub with delivery-id idempotency and links the repository", async () => {
    const { auth } = await registerTenant();
    const secret = "whsec_github_test";

    await app.inject({
      method: "POST",
      url: "/v1/repositories",
      headers: auth,
      payload: { name: "web", fullName: "acme/linked-web" },
    });
    await createIntegration(auth, {
      type: "GITHUB",
      name: "app",
      externalId: "77",
      secrets: { signingSecret: secret },
    });

    const raw = JSON.stringify({
      action: "opened",
      installation: { id: 77 },
      repository: { full_name: "acme/linked-web", default_branch: "main" },
      issue: {
        number: 12,
        title: "Export fails on empty dataset",
        body: "Steps: click export with zero rows",
        html_url: "https://github.com/acme/linked-web/issues/12",
        user: { login: "octocat" },
      },
    });
    const delivery = uniqueSuffix("delivery");
    const headers = {
      "content-type": "application/json",
      "x-github-event": "issues",
      "x-github-delivery": delivery,
      "x-hub-signature-256": githubSignature(secret, raw),
    };

    const first = await app.inject({
      method: "POST",
      url: "/v1/webhooks/github",
      headers,
      payload: raw,
    });
    expect(first.statusCode).toBe(202);
    const issueId: string = first.json().issueId;

    const replay = await app.inject({
      method: "POST",
      url: "/v1/webhooks/github",
      headers,
      payload: raw,
    });
    expect(replay.json()).toMatchObject({ duplicate: true });

    const detail = await app.inject({
      method: "GET",
      url: `/v1/issues/${issueId}`,
      headers: auth,
    });
    expect(detail.json().repository).toEqual({
      fullName: "acme/linked-web",
      defaultBranch: "main",
    });
  });

  it("ingests Jira via shared-secret header and rejects wrong secrets", async () => {
    const { auth } = await registerTenant();
    const secret = "jira-shared-secret";

    const integration = await createIntegration(auth, {
      type: "JIRA",
      name: "tickets",
      secrets: { webhookSecret: secret },
    });

    const raw = JSON.stringify({
      webhookEvent: "jira:issue_created",
      timestamp: Date.now(),
      issue: {
        id: "10001",
        key: `SUP-${uniqueSuffix("jira")}`,
        fields: {
          summary: "Export button does nothing",
          description: "Steps to reproduce...",
        },
      },
    });

    const denied = await app.inject({
      method: "POST",
      url: `/v1/webhooks/jira/${integration.id}`,
      headers: {
        "content-type": "application/json",
        "x-codebeast-secret": "wrong",
      },
      payload: raw,
    });
    expect(denied.statusCode).toBe(401);

    const accepted = await app.inject({
      method: "POST",
      url: `/v1/webhooks/jira/${integration.id}`,
      headers: {
        "content-type": "application/json",
        "x-codebeast-secret": secret,
      },
      payload: raw,
    });
    expect(accepted.statusCode).toBe(202);
    expect(accepted.json().issueId).toBeTruthy();
  });

  it("builds issue context lazily: enrichment runs once per snapshot", async () => {
    const { auth } = await registerTenant();
    const sentrySecret = "whsec_ctx";
    const slackSecret = "whsec_ctx_slack";

    await createIntegration(auth, {
      type: "SENTRY",
      name: "errors",
      externalId: "inst-ctx",
      secrets: { signingSecret: sentrySecret },
    });
    await createIntegration(auth, {
      type: "SLACK",
      name: "support",
      externalId: "T3",
      secrets: { signingSecret: slackSecret },
    });

    const sentryIssueId = String(Math.floor(Math.random() * 1_000_000_000));
    const sentryRaw = JSON.stringify({
      action: "created",
      installation: { uuid: "inst-ctx" },
      data: {
        issue: {
          id: sentryIssueId,
          title: "TypeError in export",
          culprit: "src/export.ts",
          permalink: null,
          project: { slug: "web" },
        },
      },
    });

    const sentry = await app.inject({
      method: "POST",
      url: "/v1/webhooks/sentry",
      headers: {
        "content-type": "application/json",
        "sentry-hook-signature": sentrySignature(sentrySecret, sentryRaw),
      },
      payload: sentryRaw,
    });
    expect(sentry.statusCode).toBe(202);
    const issueId: string = sentry.json().issueId;

    const callsBefore = enricherCalls.length;

    const first = await app.inject({
      method: "GET",
      url: `/v1/issues/${issueId}/context`,
      headers: auth,
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ issueId });
    expect(first.json().signals).toHaveLength(1);
    expect(first.json().enrichment).toEqual({
      sentry: { stackTrace: "fake stack trace" },
    });
    expect(enricherCalls.length - callsBefore).toBe(1);

    // Cached: no second enrichment call.
    const second = await app.inject({
      method: "GET",
      url: `/v1/issues/${issueId}/context`,
      headers: auth,
    });
    expect(second.statusCode).toBe(200);
    expect(enricherCalls.length - callsBefore).toBe(1);

    // A new signal clears the snapshot; the next build re-enriches.
    const slack = signedSlackRequest(
      "T3",
      {
        type: "event_callback",
        event_id: `Ev_${uniqueSuffix("ctx")}`,
        team_id: "T3",
        event: {
          type: "message",
          // References the Sentry issue above: attaches to the same issue.
          text: `still broken https://sentry.io/issues/${sentryIssueId}/`,
          channel: "C1",
          ts: String(Date.now() / 1000),
        },
      },
      slackSecret,
    );
    await app.inject({
      method: "POST",
      url: "/v1/webhooks/slack",
      headers: slack.headers,
      payload: slack.raw,
    });

    const third = await app.inject({
      method: "GET",
      url: `/v1/issues/${issueId}/context`,
      headers: auth,
    });
    expect(third.statusCode).toBe(200);
    expect(enricherCalls.length - callsBefore).toBe(2);
  });
});
