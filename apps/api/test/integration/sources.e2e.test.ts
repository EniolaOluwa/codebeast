import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  AGENT_CLIENT,
  type AgentClient,
} from "../../src/clients/agent.client.ts";
import {
  DISCORD_CLIENT,
  type DiscordClient,
} from "../../src/clients/discord.client.ts";
import {
  FRESHDESK_CLIENT,
  type FreshdeskClient,
} from "../../src/clients/freshdesk.client.ts";
import { RunOrchestrator } from "../../src/modules/runs/run-orchestrator.service.ts";
import { ScanRunner } from "../../src/modules/scans/scan-runner.service.ts";
import { QUEUE_PUBLISHER } from "../../src/queues/queue.types.ts";
import { codeOk, passedValidation, planOk } from "../support/agent-fixtures.ts";
import { createTestApp } from "../support/app.ts";
import { getTestDatabase, type TestDatabase } from "../support/database.ts";
import { dockerAvailable } from "../support/docker.ts";
import { drainQueue, InMemoryQueue } from "../support/in-memory-queue.ts";

const discordMessages = [
  {
    id: "d-msg-1",
    content: "Checkout is broken on mobile",
    author: { id: "u1", username: "support-agent", bot: false },
    timestamp: "2026-10-23T09:00:00.000Z",
    channelId: "chan-1",
  },
  {
    id: "d-msg-2",
    content: "noise from the helper bot",
    author: { id: "b1", username: "helper-bot", bot: true },
    timestamp: "2026-10-23T09:01:00.000Z",
    channelId: "chan-1",
  },
];

const freshdeskTickets = [
  {
    id: 8841,
    subject: "Export fails on large tables",
    description_text: "Customer reports a 500 when exporting.",
    requester: { name: "Dana", email: "dana@customer.example" },
    created_at: "2026-10-22T08:00:00.000Z",
  },
];

/**
 * Phase 7 acceptance gate: Discord (scanned) and Freshdesk (webhook + scan)
 * ingest through the same signal pipeline; replays dedupe; shared-secret
 * verification holds.
 */
describe.runIf(dockerAvailable)("sources: discord + freshdesk (e2e)", () => {
  let db: TestDatabase;
  let app: NestFastifyApplication;

  const queue = new InMemoryQueue();
  const agent = { plan: vi.fn(), code: vi.fn(), validate: vi.fn() };

  const discord: DiscordClient = {
    fetchMessages: vi.fn(async ({ channelId }) =>
      discordMessages.filter((message) => message.channelId === channelId),
    ),
  };

  const freshdesk: FreshdeskClient = {
    fetchTickets: vi.fn(async () => freshdeskTickets),
  };

  beforeAll(async () => {
    db = await getTestDatabase();
    app = await createTestApp({
      client: db.app,
      override: (builder) =>
        builder
          .overrideProvider(QUEUE_PUBLISHER)
          .useValue(queue)
          .overrideProvider(AGENT_CLIENT)
          .useValue(agent as unknown as AgentClient)
          .overrideProvider(DISCORD_CLIENT)
          .useValue(discord)
          .overrideProvider(FRESHDESK_CLIENT)
          .useValue(freshdesk),
    });
  });

  afterAll(async () => {
    await app.close();
    await db.admin.$disconnect();
    await db.app.$disconnect();
  });

  beforeEach(() => {
    queue.reset();
    agent.plan.mockReset().mockImplementation(async () => planOk());
    agent.code.mockReset().mockImplementation(async () => codeOk());
    agent.validate
      .mockReset()
      .mockImplementation(async () => passedValidation());
  });

  function orchestrator(): RunOrchestrator {
    return app.get(RunOrchestrator);
  }

  function scanRunner(): ScanRunner {
    return app.get(ScanRunner);
  }

  async function registerTenant(): Promise<{
    tenantId: string;
    auth: { authorization: string };
  }> {
    const email = `sources-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
    const register = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { email, password: "password123" },
    });
    expect(register.statusCode).toBe(201);
    const auth = {
      authorization: `Bearer ${register.json().accessToken}`,
    };

    const me = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: auth,
    });

    return { tenantId: me.json().tenantId, auth };
  }

  async function createIntegration(
    auth: Record<string, string>,
    payload: Record<string, unknown>,
  ): Promise<string> {
    const response = await app.inject({
      method: "POST",
      url: "/v1/integrations",
      headers: auth,
      payload,
    });
    expect(response.statusCode).toBe(201);
    return response.json().id as string;
  }

  it("ingests a signed Freshdesk webhook, dedupes replays and rejects bad secrets", async () => {
    const { tenantId, auth } = await registerTenant();
    const integrationId = await createIntegration(auth, {
      type: "FRESHDESK",
      name: "support",
      config: { domain: "acme.freshdesk.com" },
      secrets: { webhookSecret: "fd-webhook-secret" },
    });

    const raw = JSON.stringify({ ticket: freshdeskTickets[0] });
    const headers = {
      "content-type": "application/json",
      "x-codebeast-secret": "fd-webhook-secret",
    };

    const first = await app.inject({
      method: "POST",
      url: `/v1/webhooks/freshdesk/${integrationId}`,
      headers,
      payload: raw,
    });
    expect(first.statusCode).toBe(202);
    expect(first.json()).toMatchObject({ accepted: true, duplicate: false });
    const issueId: string = first.json().issueId;
    expect(issueId).toBeTruthy();

    const replay = await app.inject({
      method: "POST",
      url: `/v1/webhooks/freshdesk/${integrationId}`,
      headers,
      payload: raw,
    });
    expect(replay.json()).toMatchObject({ accepted: true, duplicate: true });

    const denied = await app.inject({
      method: "POST",
      url: `/v1/webhooks/freshdesk/${integrationId}`,
      headers: { ...headers, "x-codebeast-secret": "wrong" },
      payload: raw,
    });
    expect(denied.statusCode).toBe(401);

    const issue = await db.admin.issue.findFirstOrThrow({
      where: { tenantId, correlationKey: "freshdesk:ticket:8841" },
      include: { signals: true },
    });
    expect(issue.id).toBe(issueId);
    expect(issue.signals[0]).toMatchObject({
      provider: "FRESHDESK",
      externalId: "8841",
    });
    expect(issue.signals[0]!.url).toBe(
      "https://acme.freshdesk.com/a/tickets/8841",
    );
  });

  it("correlates a Freshdesk conversation that quotes a Sentry issue", async () => {
    const { tenantId, auth } = await registerTenant();
    const integrationId = await createIntegration(auth, {
      type: "FRESHDESK",
      name: "support",
      config: { domain: "acme.freshdesk.com" },
      secrets: { webhookSecret: "fd-webhook-secret" },
    });

    const raw = JSON.stringify({
      ticket: {
        ...freshdeskTickets[0],
        description_text: "same as https://sentry.io/issues/42/",
      },
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/webhooks/freshdesk/${integrationId}`,
      headers: {
        "content-type": "application/json",
        "x-codebeast-secret": "fd-webhook-secret",
      },
      payload: raw,
    });
    expect(response.statusCode).toBe(202);

    const issue = await db.admin.issue.findFirstOrThrow({
      where: { tenantId, correlationKey: "sentry:issue:42" },
    });
    expect(issue.id).toBe(response.json().issueId);
  });

  it("scans Discord channels and imports non-bot messages as reports", async () => {
    const { tenantId, auth } = await registerTenant();
    const integrationId = await createIntegration(auth, {
      type: "DISCORD",
      name: "community",
      config: { guildId: "guild-1", channelIds: ["chan-1"] },
      secrets: { botToken: "discord-bot-token" },
    });

    const scan = await app.inject({
      method: "POST",
      url: `/v1/integrations/${integrationId}/scan`,
      headers: auth,
    });
    expect(scan.statusCode).toBe(202);

    await drainQueue(queue, orchestrator(), scanRunner());

    const issue = await db.admin.issue.findFirstOrThrow({
      where: { tenantId, correlationKey: "discord:guild-1:chan-1:d-msg-1" },
      include: { signals: true },
    });
    expect(issue.signals[0]).toMatchObject({
      provider: "DISCORD",
      externalId: "d-msg-1",
      actor: "support-agent",
    });

    // The bot message was skipped.
    expect(
      await db.admin.issueSignal.count({
        where: { tenantId, externalId: "d-msg-2" },
      }),
    ).toBe(0);

    // Bookkeeping landed on the integration config.
    const integration = await db.admin.integration.findUniqueOrThrow({
      where: { id: integrationId },
    });
    expect(integration.config).toMatchObject({ lastScanFound: 1 });

    // Replaying the scan dedupes by signal uniqueness.
    const issuesBefore = await db.admin.issue.count({ where: { tenantId } });
    queue.reset();
    await app.inject({
      method: "POST",
      url: `/v1/integrations/${integrationId}/scan`,
      headers: auth,
    });
    await drainQueue(queue, orchestrator(), scanRunner());

    expect(await db.admin.issue.count({ where: { tenantId } })).toBe(
      issuesBefore,
    );
  });

  it("scans Freshdesk tickets and imports them as reports", async () => {
    const { tenantId, auth } = await registerTenant();
    const integrationId = await createIntegration(auth, {
      type: "FRESHDESK",
      name: "support",
      config: { domain: "acme.freshdesk.com" },
      secrets: { apiKey: "fd-key" },
    });

    await app.inject({
      method: "POST",
      url: `/v1/integrations/${integrationId}/scan`,
      headers: auth,
    });
    await drainQueue(queue, orchestrator(), scanRunner());

    const issue = await db.admin.issue.findFirstOrThrow({
      where: { tenantId, correlationKey: "freshdesk:ticket:8841" },
      include: { signals: true },
    });
    expect(issue.status).toBe("READY");
    expect(issue.signals[0]).toMatchObject({ provider: "FRESHDESK" });
  });

  it("refuses scans on sources without a scanner", async () => {
    const { auth } = await registerTenant();
    const integrationId = await createIntegration(auth, {
      type: "SENTRY",
      name: "errors",
      externalId: "org-1",
      secrets: { signingSecret: "whsec_x" },
    });

    const scan = await app.inject({
      method: "POST",
      url: `/v1/integrations/${integrationId}/scan`,
      headers: auth,
    });
    expect(scan.statusCode).toBe(422);
  });
});
