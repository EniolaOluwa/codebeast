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
import { RunOrchestrator } from "../../src/modules/runs/run-orchestrator.service.ts";
import { githubSignature } from "../../src/modules/webhooks/signatures.ts";
import { QUEUE_PUBLISHER } from "../../src/queues/queue.types.ts";
import { codeOk, passedValidation, planOk } from "../support/agent-fixtures.ts";
import { createTestApp } from "../support/app.ts";
import { getTestDatabase, type TestDatabase } from "../support/database.ts";
import { dockerAvailable } from "../support/docker.ts";
import { uniqueSuffix } from "../support/factories.ts";
import { drainQueue, InMemoryQueue } from "../support/in-memory-queue.ts";
import { seedReadyReport } from "../support/ready-report.ts";

/**
 * Phase 5 acceptance gate: compute ends at READY, the ship action opens a PR
 * (recorded), runs are readable via the API, issue actions behave, and GitHub
 * webhooks keep the PR record in sync.
 */
describe.runIf(dockerAvailable)("delivery (e2e)", () => {
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
          .useValue(github),
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
    github.createPullRequest.mockClear();
  });

  function orchestrator(): RunOrchestrator {
    return app.get(RunOrchestrator);
  }

  function reports() {
    return seedReadyReport({
      app,
      db,
      queue,
      orchestrator: orchestrator(),
    });
  }

  it("ships a ready report: PR recorded, issue PR_OPENED, runs readable", async () => {
    const report = await reports();

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

    const pr = await db.admin.pullRequest.findFirstOrThrow({
      where: { runId: report.runId },
    });
    expect(pr).toMatchObject({
      number: 42,
      status: "OPEN",
      baseBranch: "main",
    });
    expect(pr.url).toContain(report.repositoryFullName);
    expect(github.createPullRequest).toHaveBeenCalledOnce();
    const githubInput = github.createPullRequest.mock.calls[0]![0];
    expect(githubInput.files).toEqual([
      { path: "src/export.ts", content: "// fixed" },
    ]);
    expect(githubInput.title).toBe("fix: guard empty exports");

    // Runs read API exposes the whole chain.
    const runRes = await app.inject({
      method: "GET",
      url: `/v1/runs/${report.runId}`,
      headers: report.auth,
    });
    expect(runRes.statusCode).toBe(200);
    const run = runRes.json();
    expect(run).toMatchObject({
      status: "SUCCEEDED",
      attempt: 1,
      pullRequest: { number: 42, status: "OPEN" },
    });
    expect(run.patches[0].fileChanges).toHaveLength(1);
    expect(run.plans[0].filesToInspect).toEqual(["src/export.ts"]);
    expect(run.validations[0].status).toBe("PASSED");

    const list = await app.inject({
      method: "GET",
      url: `/v1/runs?issueId=${report.issueId}`,
      headers: report.auth,
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().pagination.total).toBe(1);
  });

  it("approves a shipped report and rejects double-approval", async () => {
    const report = await reports();

    await app.inject({
      method: "POST",
      url: `/v1/issues/${report.issueId}/pr`,
      headers: report.auth,
    });
    await drainQueue(queue, orchestrator());

    const approve = await app.inject({
      method: "POST",
      url: `/v1/issues/${report.issueId}/approve`,
      headers: report.auth,
    });
    expect(approve.statusCode).toBe(200);
    expect(approve.json().status).toBe("RESOLVED");

    const issue = await db.admin.issue.findUniqueOrThrow({
      where: { id: report.issueId },
    });
    expect(issue.resolvedAt).not.toBeNull();

    const again = await app.inject({
      method: "POST",
      url: `/v1/issues/${report.issueId}/approve`,
      headers: report.auth,
    });
    expect(again.statusCode).toBe(422);
  });

  it("ignores a report and cancels its in-flight run (jobs no-op)", async () => {
    const report = await reports();

    // Start a fresh run directly so the issue is RUNNING with queued stages.
    await db.admin.issue.update({
      where: { id: report.issueId },
      data: { status: "ESCALATED" },
    });
    await db.admin.run.update({
      where: { id: report.runId },
      data: { status: "ESCALATED" },
    });
    const retry = await app.inject({
      method: "POST",
      url: `/v1/issues/${report.issueId}/retry`,
      headers: report.auth,
    });
    expect(retry.statusCode).toBe(200);
    expect(retry.json().status).toBe("RUNNING");

    queue.reset(); // drop the plan job; we cancel instead of draining it

    const ignore = await app.inject({
      method: "POST",
      url: `/v1/issues/${report.issueId}/ignore`,
      headers: report.auth,
    });
    expect(ignore.statusCode).toBe(200);
    expect(ignore.json().status).toBe("IGNORED");

    const openRuns = await db.admin.run.findMany({
      where: { issueId: report.issueId, status: "CANCELLED" },
    });
    expect(openRuns).toHaveLength(1);
    expect(openRuns[0]!.finishedAt).not.toBeNull();
  });

  it("retries an escalated report with a fresh run that reaches READY", async () => {
    const report = await reports();

    await db.admin.issue.update({
      where: { id: report.issueId },
      data: { status: "ESCALATED" },
    });
    await db.admin.run.update({
      where: { id: report.runId },
      data: { status: "ESCALATED" },
    });

    const retry = await app.inject({
      method: "POST",
      url: `/v1/issues/${report.issueId}/retry`,
      headers: report.auth,
    });
    expect(retry.statusCode).toBe(200);

    await drainQueue(queue, orchestrator());

    const runs = await db.admin.run.findMany({
      where: { issueId: report.issueId },
      orderBy: { createdAt: "asc" },
    });
    expect(runs).toHaveLength(2);
    expect(runs[1]!.status).toBe("SUCCEEDED");
    expect(runs[1]!.attempt).toBe(1);

    const issue = await db.admin.issue.findUniqueOrThrow({
      where: { id: report.issueId },
    });
    expect(issue.status).toBe("READY");
  });

  it("refuses to ship or approve reports in the wrong state", async () => {
    const report = await reports();

    await db.admin.issue.update({
      where: { id: report.issueId },
      data: { status: "FAILED" },
    });

    const ship = await app.inject({
      method: "POST",
      url: `/v1/issues/${report.issueId}/pr`,
      headers: report.auth,
    });
    expect(ship.statusCode).toBe(422);

    const approve = await app.inject({
      method: "POST",
      url: `/v1/issues/${report.issueId}/approve`,
      headers: report.auth,
    });
    expect(approve.statusCode).toBe(422);
  });

  it("syncs pull-request state from signed GitHub webhooks (and never ingests them)", async () => {
    const report = await reports();

    await app.inject({
      method: "POST",
      url: `/v1/integrations`,
      headers: report.auth,
      payload: {
        type: "GITHUB",
        name: "app",
        externalId: "4242",
        secrets: { signingSecret: "whsec_delivery" },
      },
    });

    await app.inject({
      method: "POST",
      url: `/v1/issues/${report.issueId}/pr`,
      headers: report.auth,
    });
    await drainQueue(queue, orchestrator());

    const issuesBefore = await db.admin.issue.count({
      where: { tenantId: report.tenantId },
    });

    const raw = JSON.stringify({
      action: "closed",
      installation: { id: 4242 },
      repository: {
        full_name: report.repositoryFullName,
        default_branch: "main",
      },
      pull_request: {
        number: 42,
        title: "fix: guard empty exports",
        html_url: "https://github.com/x/y/pull/42",
        merged: true,
      },
    });
    const delivery = uniqueSuffix("delivery");
    const headers = {
      "content-type": "application/json",
      "x-github-event": "pull_request",
      "x-github-delivery": delivery,
      "x-hub-signature-256": githubSignature("whsec_delivery", raw),
    };

    const webhook = await app.inject({
      method: "POST",
      url: "/v1/webhooks/github",
      headers,
      payload: raw,
    });
    expect(webhook.statusCode).toBe(202);
    expect(webhook.json()).toMatchObject({ accepted: true, duplicate: false });

    const pr = await db.admin.pullRequest.findFirstOrThrow({
      where: { runId: report.runId },
    });
    expect(pr.status).toBe("MERGED");

    // The PR event is a sync, not a signal: no new reports.
    expect(
      await db.admin.issue.count({ where: { tenantId: report.tenantId } }),
    ).toBe(issuesBefore);

    // Replay of the same delivery is a no-op duplicate.
    const replay = await app.inject({
      method: "POST",
      url: "/v1/webhooks/github",
      headers,
      payload: raw,
    });
    expect(replay.statusCode).toBe(202);
    expect(replay.json()).toMatchObject({ duplicate: true });

    const afterReplay = await db.admin.pullRequest.findFirstOrThrow({
      where: { runId: report.runId },
    });
    expect(afterReplay.status).toBe("MERGED");

    // The issue itself stays PR_OPENED until a human approves.
    const issue = await db.admin.issue.findUniqueOrThrow({
      where: { id: report.issueId },
    });
    expect(issue.status).toBe("PR_OPENED");
  });
});
