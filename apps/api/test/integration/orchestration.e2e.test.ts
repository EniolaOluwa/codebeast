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
import {
  type IngestJob,
  type PublishOptions,
  QUEUE_PUBLISHER,
  type QueueJobPayloads,
  type QueueName,
  type QueuePublisher,
  type RunStageJob,
  type TriageJob,
} from "../../src/queues/queue.types.ts";
import { createTestApp } from "../support/app.ts";
import { getTestDatabase, type TestDatabase } from "../support/database.ts";
import { dockerAvailable } from "../support/docker.ts";
import {
  createIssueFixture,
  createSignalFixture,
  createTenantFixture,
} from "../support/factories.ts";

/**
 * In-memory queue: dedupes by jobId (like BullMQ) and lets the test drain
 * jobs deterministically through the real orchestrator. Job-level retries
 * are Redis behavior covered by the publisher test.
 */
class InMemoryQueue implements QueuePublisher {
  readonly jobs: {
    queue: QueueName;
    payload: Record<string, unknown>;
    options?: PublishOptions;
  }[] = [];

  /** Accepted publishes in order, for idempotency-key assertions. */
  readonly history: { queue: QueueName; jobId?: string }[] = [];

  private readonly seen = new Set<string>();

  async publish<Q extends QueueName>(
    queue: Q,
    payload: QueueJobPayloads[Q],
    options?: PublishOptions,
  ): Promise<void> {
    if (options?.jobId) {
      if (this.seen.has(options.jobId)) {
        return;
      }
      this.seen.add(options.jobId);
    }

    this.history.push({
      queue,
      ...(options?.jobId ? { jobId: options.jobId } : {}),
    });
    this.jobs.push({
      queue,
      payload: payload as unknown as Record<string, unknown>,
      options,
    });
  }

  reset(): void {
    this.jobs.length = 0;
    this.history.length = 0;
    this.seen.clear();
  }
}

async function drain(
  queue: InMemoryQueue,
  orchestrator: RunOrchestrator,
): Promise<void> {
  while (queue.jobs.length > 0) {
    const job = queue.jobs.shift()!;

    switch (job.queue) {
      case "ingest":
        await orchestrator.handleIngest(job.payload as unknown as IngestJob);
        break;
      case "triage":
        await orchestrator.handleTriage(job.payload as unknown as TriageJob);
        break;
      case "plan":
      case "code":
      case "validate":
      case "pr": {
        const stageJob = job.payload as unknown as RunStageJob;

        if (job.queue === "plan") {
          await orchestrator.handlePlan(stageJob);
        } else if (job.queue === "code") {
          await orchestrator.handleCode(stageJob);
        } else if (job.queue === "validate") {
          await orchestrator.handleValidate(stageJob);
        } else {
          await orchestrator.handlePr(stageJob);
        }
        break;
      }
    }
  }
}

const planOk = () => ({
  ok: true as const,
  value: {
    rootCause: "row is undefined before the guard",
    filesToInspect: ["src/export.ts"],
    changeStrategy: "add an early return",
    testsToRun: ["src/export.test.ts"],
    confidence: 0.9,
    needsMoreContext: false,
  },
});

const codeOk = () => ({
  ok: true as const,
  value: {
    changes: [
      { path: "src/export.ts", oldContent: "", newContent: "// fixed" },
    ],
    commitMessage: "fix: export",
    testsToRun: ["src/export.test.ts"],
    rationale: "guard",
  },
});

const validation = (status: "PASSED" | "FAILED" | "ERRORED") => ({
  ok: true as const,
  value: {
    status,
    testsRun: ["src/export.test.ts"],
    lintPassed: status === "PASSED",
    typesPassed: status === "PASSED",
    output: status === "PASSED" ? "" : `${status} output`,
  },
});

/**
 * Phase 4 acceptance gate: ingest → coalesced triage → plan → code → validate
 * → pr through the real orchestrator and database, including coder retries,
 * attempt accounting and escalation.
 */
describe.runIf(dockerAvailable)("run orchestration (e2e)", () => {
  let db: TestDatabase;
  let app: NestFastifyApplication;

  const queue = new InMemoryQueue();
  const agent = {
    plan: vi.fn(),
    code: vi.fn(),
    validate: vi.fn(),
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
      .mockImplementation(async () => validation("PASSED"));
  });

  async function seedIssue(): Promise<{ tenantId: string; issueId: string }> {
    const tenant = await createTenantFixture(db.admin);
    const issue = await createIssueFixture(db.admin, tenant.id);
    await createSignalFixture(db.admin, {
      tenantId: tenant.id,
      issueId: issue.id,
    });

    return { tenantId: tenant.id, issueId: issue.id };
  }

  function orchestrator(): RunOrchestrator {
    return app.get(RunOrchestrator);
  }

  it("drives a full run: ingest → triage → plan → code → validate → pr", async () => {
    const { tenantId, issueId } = await seedIssue();

    await orchestrator().handleIngest({ tenantId, issueId });

    // Coalescing window + de-duplication key are set before draining.
    expect(queue.jobs).toEqual([
      {
        queue: "triage",
        payload: { tenantId, issueId },
        options: { jobId: `triage-${issueId}`, delayMs: 30_000 },
      },
    ]);

    await drain(queue, orchestrator());

    const run = await db.admin.run.findFirstOrThrow({
      where: { issueId },
    });
    expect(run.status).toBe("SUCCEEDED");
    expect(run.attempt).toBe(1);
    expect(run.finishedAt).not.toBeNull();

    const issue = await db.admin.issue.findUniqueOrThrow({
      where: { id: issueId },
    });
    expect(issue.status).toBe("PR_OPENED");

    const plan = await db.admin.plan.findFirstOrThrow({
      where: { runId: run.id },
    });
    expect(plan.attempt).toBe(1);
    expect(plan.filesToInspect).toEqual(["src/export.ts"]);

    const patch = await db.admin.patch.findFirstOrThrow({
      where: { runId: run.id },
      include: { fileChanges: true },
    });
    expect(patch.fileChanges).toHaveLength(1);
    expect(patch.testsToRun).toEqual(["src/export.test.ts"]);

    const validationRow = await db.admin.validationRun.findFirstOrThrow({
      where: { runId: run.id },
    });
    expect(validationRow.status).toBe("PASSED");

    // One job per stage, in order, ids carrying the attempt number.
    expect(queue.history.map((entry) => entry.jobId)).toEqual([
      `triage-${issueId}`,
      `run-${run.id}-plan-1`,
      `run-${run.id}-code-1`,
      `run-${run.id}-validate-1`,
      `run-${run.id}-pr-1`,
    ]);
    expect(queue.history.map((entry) => entry.queue)).toEqual([
      "triage",
      "plan",
      "code",
      "validate",
      "pr",
    ]);

    expect(agent.plan).toHaveBeenCalledOnce();
    expect(agent.code).toHaveBeenCalledOnce();
    expect(agent.validate).toHaveBeenCalledOnce();
  });

  it("sends validator failures back to the coder with the error attached", async () => {
    const { tenantId, issueId } = await seedIssue();

    agent.validate
      .mockImplementationOnce(async () => validation("FAILED"))
      .mockImplementation(async () => validation("PASSED"));

    await orchestrator().handleIngest({ tenantId, issueId });
    await drain(queue, orchestrator());

    const run = await db.admin.run.findFirstOrThrow({ where: { issueId } });
    expect(run.status).toBe("SUCCEEDED");
    expect(run.attempt).toBe(2);
    expect(run.lastError).toBeNull();

    const patches = await db.admin.patch.findMany({ where: { runId: run.id } });
    expect(patches.map((p) => p.attempt)).toEqual([1, 2]);

    const validations = await db.admin.validationRun.findMany({
      where: { runId: run.id },
      orderBy: { attempt: "asc" },
    });
    expect(validations.map((v) => v.status)).toEqual(["FAILED", "PASSED"]);

    // The coder retry saw the validator output.
    const retryInput = agent.code.mock.calls[1]![0] as unknown as {
      previousError?: string;
    };
    expect(retryInput.previousError).toContain("FAILED output");
  });

  it("escalates after three failed attempts and flags the issue", async () => {
    const { tenantId, issueId } = await seedIssue();

    agent.validate.mockImplementation(async () => validation("FAILED"));

    await orchestrator().handleIngest({ tenantId, issueId });
    await drain(queue, orchestrator());

    const run = await db.admin.run.findFirstOrThrow({ where: { issueId } });
    expect(run.status).toBe("ESCALATED");
    expect(run.attempt).toBe(3);

    const issue = await db.admin.issue.findUniqueOrThrow({
      where: { id: issueId },
    });
    expect(issue.status).toBe("ESCALATED");

    expect(
      await db.admin.validationRun.count({ where: { runId: run.id } }),
    ).toBe(3);
    expect(agent.code).toHaveBeenCalledTimes(3);
  });

  it("replaying triage never opens a second run (idempotency guard)", async () => {
    const { tenantId, issueId } = await seedIssue();

    await orchestrator().handleTriage({ tenantId, issueId });
    await orchestrator().handleTriage({ tenantId, issueId });

    expect(await db.admin.run.count({ where: { issueId } })).toBe(1);
  });

  it("replaying a completed stage job does not advance the run", async () => {
    const { tenantId, issueId } = await seedIssue();

    await orchestrator().handleIngest({ tenantId, issueId });
    await drain(queue, orchestrator());

    const run = await db.admin.run.findFirstOrThrow({ where: { issueId } });
    expect(run.status).toBe("SUCCEEDED");

    queue.reset();

    // Replayed plan job for a run that already finished: no-op.
    await orchestrator().handlePlan({ tenantId, runId: run.id });

    expect(queue.jobs).toHaveLength(0);
    const after = await db.admin.run.findUniqueOrThrow({
      where: { id: run.id },
    });
    expect(after.status).toBe("SUCCEEDED");
  });
});
