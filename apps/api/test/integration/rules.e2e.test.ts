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
import { RunOrchestrator } from "../../src/modules/runs/run-orchestrator.service.ts";
import { QUEUE_PUBLISHER } from "../../src/queues/queue.types.ts";
import { codeOk, passedValidation, planOk } from "../support/agent-fixtures.ts";
import { createTestApp } from "../support/app.ts";
import { getTestDatabase, type TestDatabase } from "../support/database.ts";
import { dockerAvailable } from "../support/docker.ts";
import {
  createIssueFixture,
  createRepositoryFixture,
  createSignalFixture,
  uniqueSuffix,
} from "../support/factories.ts";
import { drainQueue, InMemoryQueue } from "../support/in-memory-queue.ts";
import { signedSlackRequest } from "../support/signed-requests.ts";

/**
 * Phase 8 acceptance gate: rule CRUD with PR safety rails, detection rules
 * gating compute, automation rules shipping tickets/PRs within the confidence
 * floor and daily limit, and the 7-day dry run.
 */
describe.runIf(dockerAvailable)("rules engine (e2e)", () => {
  let db: TestDatabase;
  let app: NestFastifyApplication;

  const queue = new InMemoryQueue();
  const agent = { plan: vi.fn(), code: vi.fn(), validate: vi.fn() };

  beforeAll(async () => {
    db = await getTestDatabase();
    app = await createTestApp({
      client: db.app,
      override: (builder) =>
        builder
          .overrideProvider(QUEUE_PUBLISHER)
          .useValue(queue)
          .overrideProvider(AGENT_CLIENT)
          .useValue(agent as unknown as AgentClient),
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

  async function registerTenant(): Promise<{
    tenantId: string;
    auth: { authorization: string };
  }> {
    const email = `rules-${uniqueSuffix("user")}@example.com`;
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

  async function createRule(
    auth: Record<string, string>,
    payload: Record<string, unknown>,
  ) {
    return app.inject({
      method: "POST",
      url: "/v1/rules",
      headers: auth,
      payload,
    });
  }

  it("manages rules and enforces the PR safety rails", async () => {
    const { auth } = await registerTenant();

    const underConfigured = await createRule(auth, {
      kind: "AUTOMATION",
      name: "ship everything",
      enabled: true,
      actions: { createTicket: true, openPr: true },
    });
    expect(underConfigured.statusCode).toBe(422);

    const created = await createRule(auth, {
      kind: "AUTOMATION",
      name: "ship with rails",
      enabled: false,
      conditions: { minSignalCount: 1 },
      actions: {
        createTicket: true,
        openPr: true,
        repositoryId: "repo_x",
        minConfidence: 0.5,
        dailyPrLimit: 5,
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      kind: "AUTOMATION",
      enabled: false,
      actions: { openPr: true, dailyPrLimit: 5 },
    });
    const ruleId: string = created.json().id;

    const enabled = await app.inject({
      method: "PATCH",
      url: `/v1/rules/${ruleId}`,
      headers: auth,
      payload: { enabled: true },
    });
    expect(enabled.json().enabled).toBe(true);

    const list = await app.inject({
      method: "GET",
      url: "/v1/rules?kind=AUTOMATION",
      headers: auth,
    });
    expect(list.json()).toHaveLength(1);

    const removed = await app.inject({
      method: "DELETE",
      url: `/v1/rules/${ruleId}`,
      headers: auth,
    });
    expect(removed.statusCode).toBe(200);
    expect(
      (
        await app.inject({ method: "GET", url: "/v1/rules", headers: auth })
      ).json(),
    ).toHaveLength(0);
  });

  it("detection rules gate compute: matching reports are recorded as ignored", async () => {
    const { tenantId, auth } = await registerTenant();

    await app.inject({
      method: "POST",
      url: "/v1/integrations",
      headers: auth,
      payload: {
        type: "SLACK",
        name: "support",
        externalId: `T-${uniqueSuffix("team")}`,
        secrets: { signingSecret: "whsec_rules" },
      },
    });

    const created = await createRule(auth, {
      kind: "DETECTION",
      name: "drop spam",
      enabled: true,
      conditions: { titleContains: "spam" },
      actions: { action: "IGNORE" },
    });
    expect(created.statusCode).toBe(201);
    const teamId = (
      await db.admin.integration.findFirstOrThrow({
        where: { tenantId, type: "SLACK" },
      })
    ).externalId!;

    const spam = signedSlackRequest(
      teamId,
      {
        type: "event_callback",
        event_id: uniqueSuffix("ev"),
        team_id: teamId,
        event: {
          type: "message",
          text: "spam: buy now",
          channel: "C1",
          ts: String(Date.now() / 1000),
        },
      },
      "whsec_rules",
    );

    const accepted = await app.inject({
      method: "POST",
      url: "/v1/webhooks/slack",
      headers: spam.headers,
      payload: spam.raw,
    });
    expect(accepted.statusCode).toBe(202);
    const ignoredIssueId: string = accepted.json().issueId;

    await drainQueue(queue, orchestrator());

    const ignored = await db.admin.issue.findUniqueOrThrow({
      where: { id: ignoredIssueId },
    });
    expect(ignored.status).toBe("IGNORED");
    expect(
      await db.admin.run.count({ where: { issueId: ignoredIssueId } }),
    ).toBe(0);

    // A non-matching report computes normally.
    const normal = signedSlackRequest(
      teamId,
      {
        type: "event_callback",
        event_id: uniqueSuffix("ev"),
        team_id: teamId,
        event: {
          type: "message",
          text: "export crashes on empty tables",
          channel: "C2",
          ts: String(Date.now() / 1000),
        },
      },
      "whsec_rules",
    );
    const normalAccepted = await app.inject({
      method: "POST",
      url: "/v1/webhooks/slack",
      headers: normal.headers,
      payload: normal.raw,
    });
    await drainQueue(queue, orchestrator());

    const computed = await db.admin.issue.findUniqueOrThrow({
      where: { id: normalAccepted.json().issueId },
    });
    expect(computed.status).toBe("READY");
  });

  it("automation rules create the ticket and open the PR within the rails", async () => {
    const { tenantId, auth } = await registerTenant();

    const repository = await createRepositoryFixture(db.admin, tenantId, {
      fullName: `acme/${uniqueSuffix("auto")}`,
    });

    const created = await createRule(auth, {
      kind: "AUTOMATION",
      name: "ship small fixes",
      enabled: true,
      // Seeded fixtures do not increment signalCount; match everything.
      conditions: {},
      actions: {
        createTicket: true,
        openPr: true,
        repositoryId: repository.id,
        minConfidence: 0.5,
        dailyPrLimit: 5,
      },
    });
    expect(created.statusCode).toBe(201);

    // Report with no repository of its own: the rule supplies it.
    const issue = await createIssueFixture(db.admin, tenantId);
    await createSignalFixture(db.admin, {
      tenantId,
      issueId: issue.id,
    });

    await orchestrator().handleIngest({ tenantId, issueId: issue.id });
    await drainQueue(queue, orchestrator());

    const shipped = await db.admin.issue.findUniqueOrThrow({
      where: { id: issue.id },
      include: { ticket: true },
    });
    expect(shipped.status).toBe("PR_OPENED");
    expect(shipped.repositoryId).toBe(repository.id);
    expect(shipped.ticket).not.toBeNull();

    const pr = await db.admin.pullRequest.findFirstOrThrow({
      where: { tenantId },
    });
    expect(pr.repositoryId).toBe(repository.id);
  });

  it("respects the daily PR limit (ticket still created)", async () => {
    const { tenantId, auth } = await registerTenant();

    const repository = await createRepositoryFixture(db.admin, tenantId, {
      fullName: `acme/${uniqueSuffix("limit")}`,
    });

    await createRule(auth, {
      kind: "AUTOMATION",
      name: "one PR per day",
      enabled: true,
      conditions: {},
      actions: {
        createTicket: true,
        openPr: true,
        repositoryId: repository.id,
        minConfidence: 0.5,
        dailyPrLimit: 1,
      },
    });

    for (const title of ["first issue", "second issue"]) {
      const issue = await createIssueFixture(db.admin, tenantId, { title });
      await createSignalFixture(db.admin, { tenantId, issueId: issue.id });
      await orchestrator().handleIngest({ tenantId, issueId: issue.id });
      await drainQueue(queue, orchestrator());
    }

    expect(await db.admin.pullRequest.count({ where: { tenantId } })).toBe(1);

    const second = await db.admin.issue.findFirstOrThrow({
      where: { tenantId, title: "second issue" },
    });
    // Ticket shipped, PR skipped by the limit.
    expect(second.status).toBe("TICKETED");
  });

  it("dry-runs a rule against the last 7 days", async () => {
    const { tenantId, auth } = await registerTenant();

    for (const title of ["dry one", "dry two"]) {
      const issue = await createIssueFixture(db.admin, tenantId, { title });
      await createSignalFixture(db.admin, { tenantId, issueId: issue.id });
    }

    const created = await createRule(auth, {
      kind: "DETECTION",
      name: "catch everything",
      enabled: false,
      conditions: {},
      actions: { action: "DETECT" },
    });

    const dryRun = await app.inject({
      method: "POST",
      url: `/v1/rules/${created.json().id}/dry-run`,
      headers: auth,
    });
    expect(dryRun.statusCode).toBe(200);
    expect(dryRun.json()).toMatchObject({ windowDays: 7, matched: 2 });
    expect(dryRun.json().sample).toHaveLength(2);
  });
});
