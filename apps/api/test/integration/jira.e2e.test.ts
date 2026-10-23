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
  type CreatedPullRequest,
  type CreatePullRequestInput,
  GITHUB_CLIENT,
} from "../../src/clients/github.client.ts";
import {
  type CreatedJiraIssue,
  type CreateJiraIssueInput,
  JIRA_CLIENT,
  type ScannedJiraIssue,
} from "../../src/clients/jira.client.ts";
import { RunOrchestrator } from "../../src/modules/runs/run-orchestrator.service.ts";
import { ScanRunner } from "../../src/modules/scans/scan-runner.service.ts";
import { QUEUE_PUBLISHER } from "../../src/queues/queue.types.ts";
import { codeOk, passedValidation, planOk } from "../support/agent-fixtures.ts";
import { createTestApp } from "../support/app.ts";
import { getTestDatabase, type TestDatabase } from "../support/database.ts";
import { dockerAvailable } from "../support/docker.ts";
import { createSignalFixture } from "../support/factories.ts";
import { drainQueue, InMemoryQueue } from "../support/in-memory-queue.ts";
import { seedReadyReport } from "../support/ready-report.ts";

const scanItems: ScannedJiraIssue[] = [
  {
    key: "ENG-101",
    summary: "Export crashes on empty dataset",
    description: "Customer reports a 500 when exporting an empty table.",
    url: "https://acme.atlassian.net/browse/ENG-101",
    created: "2026-10-20T09:00:00.000Z",
  },
  {
    key: "ENG-102",
    summary: "Avatar upload fails over 5MB",
    description: "Uploads bigger than 5MB return a 413.",
    url: "https://acme.atlassian.net/browse/ENG-102",
    created: "2026-10-21T09:00:00.000Z",
  },
];

/**
 * Phase 5.5 acceptance gate: Jira as a destination (tickets from reports,
 * idempotent, previewable evidence) and as a source (JQL scan importing
 * existing items through the shared correlation pipeline), plus the overview
 * aggregates the console reads.
 */
describe.runIf(dockerAvailable)("jira bidirectional (e2e)", () => {
  let db: TestDatabase;
  let app: NestFastifyApplication;

  const queue = new InMemoryQueue();
  const agent = { plan: vi.fn(), code: vi.fn(), validate: vi.fn() };
  const github = {
    createPullRequest: vi.fn(
      async (input: CreatePullRequestInput): Promise<CreatedPullRequest> => ({
        number: 42,
        url: `https://github.com/${input.repository.fullName}/pull/42`,
        headBranch: input.headBranch,
        baseBranch: input.repository.defaultBranch,
      }),
    ),
  };
  const jira = {
    createIssue: vi.fn(
      async (_input: CreateJiraIssueInput): Promise<CreatedJiraIssue> => ({
        key: "ENG-900",
        url: "https://acme.atlassian.net/browse/ENG-900",
        projectKey: "ENG",
        issueType: "Bug",
      }),
    ),
    scan: vi.fn(async (): Promise<ScannedJiraIssue[]> => scanItems),
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
          .overrideProvider(GITHUB_CLIENT)
          .useValue(github)
          .overrideProvider(JIRA_CLIENT)
          .useValue(jira),
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
    jira.createIssue.mockClear();
    jira.scan.mockClear();
  });

  function orchestrator(): RunOrchestrator {
    return app.get(RunOrchestrator);
  }

  function scanRunner(): ScanRunner {
    return app.get(ScanRunner);
  }

  async function reports() {
    return seedReadyReport({ app, db, queue, orchestrator: orchestrator() });
  }

  it("creates a Jira ticket for a ready report, idempotently", async () => {
    const report = await reports();

    const request = await app.inject({
      method: "POST",
      url: `/v1/issues/${report.issueId}/ticket`,
      headers: report.auth,
    });
    expect(request.statusCode).toBe(202);

    expect(queue.history.at(-1)).toEqual({
      queue: "ticket",
      jobId: `ticket-${report.issueId}-create`,
    });

    await drainQueue(queue, orchestrator());

    const issue = await db.admin.issue.findUniqueOrThrow({
      where: { id: report.issueId },
    });
    expect(issue.status).toBe("TICKETED");

    const ticket = await db.admin.ticket.findFirstOrThrow({
      where: { issueId: report.issueId },
    });
    expect(ticket).toMatchObject({
      key: "ENG-900",
      projectKey: "ENG",
      issueType: "Bug",
    });
    expect(jira.createIssue).toHaveBeenCalledOnce();
    const description = jira.createIssue.mock.calls[0]![0].description;
    expect(description).toContain("row is undefined before the guard");

    // The issue detail exposes the ticket for the UI chip.
    const detail = await app.inject({
      method: "GET",
      url: `/v1/issues/${report.issueId}`,
      headers: report.auth,
    });
    expect(detail.json().ticket).toMatchObject({
      key: "ENG-900",
      url: "https://acme.atlassian.net/browse/ENG-900",
    });

    // Re-requesting is a no-op at the handler level: one ticket, one call.
    await orchestrator().handleCreateTicket({
      tenantId: report.tenantId,
      issueId: report.issueId,
    });
    expect(
      await db.admin.ticket.count({ where: { issueId: report.issueId } }),
    ).toBe(1);
    expect(jira.createIssue).toHaveBeenCalledOnce();
  });

  it("adds a pull request to a ticketed report (both artifacts recorded)", async () => {
    const report = await reports();

    await app.inject({
      method: "POST",
      url: `/v1/issues/${report.issueId}/ticket`,
      headers: report.auth,
    });
    await drainQueue(queue, orchestrator());

    const ship = await app.inject({
      method: "POST",
      url: `/v1/issues/${report.issueId}/pr`,
      headers: report.auth,
    });
    expect(ship.statusCode).toBe(202);
    await drainQueue(queue, orchestrator());

    const issue = await db.admin.issue.findUniqueOrThrow({
      where: { id: report.issueId },
    });
    expect(issue.status).toBe("PR_OPENED");

    const detail = await app.inject({
      method: "GET",
      url: `/v1/issues/${report.issueId}`,
      headers: report.auth,
    });
    expect(detail.json().ticket).toMatchObject({ key: "ENG-900" });

    const run = await app.inject({
      method: "GET",
      url: `/v1/runs/${report.runId}`,
      headers: report.auth,
    });
    expect(run.json().pullRequest).toMatchObject({
      number: 42,
      status: "OPEN",
    });
  });

  it("scans a Jira source and imports existing items as reports", async () => {
    const report = await reports();

    const integration = await app.inject({
      method: "POST",
      url: "/v1/integrations",
      headers: report.auth,
      payload: {
        type: "JIRA",
        name: "tickets",
        config: {
          siteUrl: "https://acme.atlassian.net",
          projectKey: "ENG",
          jql: "project = ENG AND statusCategory != Done",
        },
        secrets: { email: "bot@acme.co", apiToken: "token" },
      },
    });
    expect(integration.statusCode).toBe(201);
    const integrationId: string = integration.json().id;

    const scan = await app.inject({
      method: "POST",
      url: `/v1/integrations/${integrationId}/scan`,
      headers: report.auth,
    });
    expect(scan.statusCode).toBe(202);

    await drainQueue(queue, orchestrator(), scanRunner());

    expect(jira.scan).toHaveBeenCalledOnce();

    // Scanned items became reports and ran the full compute pipeline.
    for (const key of ["ENG-101", "ENG-102"]) {
      const issue = await db.admin.issue.findFirstOrThrow({
        where: {
          tenantId: report.tenantId,
          correlationKey: `jira:issue:${key}`,
        },
        include: { signals: true },
      });
      expect(issue.status).toBe("READY");
      expect(issue.signals[0]).toMatchObject({
        provider: "JIRA",
        externalId: key,
        eventType: "jira.scan",
      });
    }

    // The scan recorded its bookkeeping on the integration config.
    const afterScan = await db.admin.integration.findUniqueOrThrow({
      where: { id: integrationId },
    });
    expect(afterScan.config).toMatchObject({ lastScanFound: 2 });

    // Replaying the scan does not duplicate anything (signal idempotency).
    const issuesBefore = await db.admin.issue.count({
      where: { tenantId: report.tenantId },
    });
    queue.reset();
    await app.inject({
      method: "POST",
      url: `/v1/integrations/${integrationId}/scan`,
      headers: report.auth,
    });
    await drainQueue(queue, orchestrator(), scanRunner());

    expect(
      await db.admin.issue.count({ where: { tenantId: report.tenantId } }),
    ).toBe(issuesBefore);
  });

  it("serves the overview aggregates the console reads", async () => {
    const report = await reports();

    // Give the JIRA "source" a heartbeat so source health has data.
    await createSignalFixture(db.admin, {
      tenantId: report.tenantId,
      issueId: report.issueId,
      provider: "JIRA",
    });

    const integration = await app.inject({
      method: "POST",
      url: "/v1/integrations",
      headers: report.auth,
      payload: {
        type: "JIRA",
        name: "tickets",
        config: { siteUrl: "https://acme.atlassian.net", projectKey: "ENG" },
        secrets: { email: "bot@acme.co", apiToken: "token" },
      },
    });
    expect(integration.statusCode).toBe(201);

    // Before shipping: the report is waiting for review, no tickets yet.
    const before = await app.inject({
      method: "GET",
      url: "/v1/overview",
      headers: report.auth,
    });
    expect(before.statusCode).toBe(200);

    const beforeBody = before.json();
    expect(beforeBody.windowDays).toBe(7);
    expect(beforeBody.reportsFound).toBe(1);
    expect(beforeBody.ticketsCreated).toBe(0);
    expect(beforeBody.prsOpened).toBe(0);
    expect(
      beforeBody.needsReview.map((issue: { id: string }) => issue.id),
    ).toContain(report.issueId);

    const jiraSource = beforeBody.sources.find(
      (source: { type: string }) => source.type === "JIRA",
    );
    expect(jiraSource).toMatchObject({ name: "tickets", healthy: true });
    expect(jiraSource.lastSeenAt).not.toBeNull();

    // After shipping: a ticket exists and the report leaves the review queue.
    await app.inject({
      method: "POST",
      url: `/v1/issues/${report.issueId}/ticket`,
      headers: report.auth,
    });
    await drainQueue(queue, orchestrator());

    const after = await app.inject({
      method: "GET",
      url: "/v1/overview",
      headers: report.auth,
    });
    const afterBody = after.json();
    expect(afterBody.ticketsCreated).toBe(1);
    expect(
      afterBody.needsReview.map((issue: { id: string }) => issue.id),
    ).not.toContain(report.issueId);
  });
});
