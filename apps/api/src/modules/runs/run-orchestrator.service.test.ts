import type { ConfigService } from "@nestjs/config";
import type {
  IssueContext,
  PatchSubmission,
  PlanBlueprint,
  ValidationResult,
} from "@repo/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentClient, AgentResult } from "../../clients/agent.client.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";
import type {
  PublishOptions,
  QueueJobPayloads,
  QueueName,
  QueuePublisher,
} from "../../queues/queue.types.ts";
import type { TriageService } from "../triage/triage.service.ts";
import { RunOrchestrator } from "./run-orchestrator.service.ts";

class RecordingPublisher implements QueuePublisher {
  readonly jobs: {
    queue: QueueName;
    payload: unknown;
    options?: PublishOptions;
  }[] = [];

  async publish<Q extends QueueName>(
    queue: Q,
    payload: QueueJobPayloads[Q],
    options?: PublishOptions,
  ): Promise<void> {
    this.jobs.push({ queue, payload, options });
  }
}

const context: IssueContext = {
  issueId: "issue_1",
  title: "Export broken",
  summary: "summary",
  repository: null,
  signals: [],
  topFrames: [],
  enrichment: null,
};

const planBlueprint: PlanBlueprint = {
  rootCause: "row is undefined before the guard",
  filesToInspect: ["src/export.ts"],
  changeStrategy: "early return",
  testsToRun: ["src/export.test.ts"],
  confidence: 0.9,
  needsMoreContext: false,
};

const patch: PatchSubmission = {
  changes: [{ path: "src/export.ts", oldContent: "", newContent: "x" }],
  commitMessage: "fix: export",
  testsToRun: ["src/export.test.ts"],
  rationale: "guard",
};

const passedValidation: ValidationResult = {
  status: "PASSED",
  testsRun: ["src/export.test.ts"],
  lintPassed: true,
  typesPassed: true,
  output: "",
};

function runRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "run_1",
    tenantId: "tenant_1",
    issueId: "issue_1",
    status: "PLANNING",
    attempt: 1,
    replans: 0,
    maxAttempts: 3,
    lastError: null,
    ...overrides,
  };
}

function makeHarness() {
  const tx = {
    run: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    plan: { create: vi.fn(), findFirst: vi.fn() },
    patch: { create: vi.fn(), findFirst: vi.fn() },
    validationRun: { create: vi.fn() },
    issue: { update: vi.fn() },
  };

  const prisma = {
    withTenant: vi.fn(
      async (_tenantId: string, fn: (txArg: unknown) => unknown) => fn(tx),
    ),
  } as unknown as PrismaService;

  const triage = {
    buildIssueContext: vi.fn(async (): Promise<IssueContext> => context),
  } as unknown as TriageService;

  const agent = {
    plan: vi.fn(async (): Promise<AgentResult<PlanBlueprint>> => ({
      ok: true,
      value: planBlueprint,
    })),
    code: vi.fn(async (): Promise<AgentResult<PatchSubmission>> => ({
      ok: true,
      value: patch,
    })),
    validate: vi.fn(async (): Promise<AgentResult<ValidationResult>> => ({
      ok: true,
      value: passedValidation,
    })),
  } as unknown as AgentClient & {
    plan: ReturnType<typeof vi.fn>;
    code: ReturnType<typeof vi.fn>;
    validate: ReturnType<typeof vi.fn>;
  };

  const publisher = new RecordingPublisher();

  const config = {
    getOrThrow: (key: string): unknown =>
      key === "INGEST_COALESCE_MS" ? 30_000 : undefined,
  } as unknown as ConfigService;

  const orchestrator = new RunOrchestrator(
    prisma,
    triage,
    agent,
    publisher,
    config,
  );

  return { orchestrator, prisma, tx, triage, agent, publisher };
}

describe("RunOrchestrator.handleIngest", () => {
  it("coalesces into a delayed, de-duplicated triage job", async () => {
    const { orchestrator, publisher } = makeHarness();

    await orchestrator.handleIngest({
      tenantId: "tenant_1",
      issueId: "issue_1",
    });

    expect(publisher.jobs).toEqual([
      {
        queue: "triage",
        payload: { tenantId: "tenant_1", issueId: "issue_1" },
        options: { jobId: "triage-issue_1", delayMs: 30_000 },
      },
    ]);
  });
});

describe("RunOrchestrator.handleTriage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a run and publishes the first plan job", async () => {
    const { orchestrator, tx, publisher } = makeHarness();

    tx.run.findFirst.mockResolvedValue(null);
    tx.run.create.mockResolvedValue({ id: "run_1" });

    await orchestrator.handleTriage({
      tenantId: "tenant_1",
      issueId: "issue_1",
    });

    expect(tx.run.create.mock.calls[0]![0].data).toMatchObject({
      tenantId: "tenant_1",
      issueId: "issue_1",
      status: "QUEUED",
      attempt: 0,
      maxAttempts: 3,
    });
    expect(tx.run.update).toHaveBeenCalledWith({
      where: { id: "run_1" },
      data: { status: "PLANNING", attempt: 1 },
    });
    expect(tx.issue.update).toHaveBeenCalledWith({
      where: { id: "issue_1" },
      data: { status: "RUNNING" },
    });
    expect(publisher.jobs).toEqual([
      {
        queue: "plan",
        payload: { tenantId: "tenant_1", runId: "run_1" },
        options: { jobId: "run-run_1-plan-1" },
      },
    ]);
  });

  it("skips when a run is already open for the issue", async () => {
    const { orchestrator, tx, publisher, triage } = makeHarness();

    tx.run.findFirst.mockResolvedValue({ id: "run_open" });

    await orchestrator.handleTriage({
      tenantId: "tenant_1",
      issueId: "issue_1",
    });

    expect(tx.run.create).not.toHaveBeenCalled();
    expect(publisher.jobs).toHaveLength(0);
    expect(triage.buildIssueContext).not.toHaveBeenCalled();
  });
});

describe("RunOrchestrator.handlePlan", () => {
  it("stores the plan and advances to coding", async () => {
    const { orchestrator, tx, publisher } = makeHarness();

    tx.run.findUnique.mockResolvedValue(runRow());

    await orchestrator.handlePlan({ tenantId: "tenant_1", runId: "run_1" });

    expect(tx.plan.create.mock.calls[0]![0].data).toMatchObject({
      runId: "run_1",
      attempt: 1,
      rootCause: planBlueprint.rootCause,
    });
    expect(tx.run.update).toHaveBeenCalledWith({
      where: { id: "run_1" },
      data: { rootCause: planBlueprint.rootCause, confidence: 0.9 },
    });
    const finalUpdate = tx.run.update.mock.calls.at(-1)![0].data;
    expect(finalUpdate).toMatchObject({ status: "CODING", attempt: 1 });
    expect(publisher.jobs.at(-1)).toEqual({
      queue: "code",
      payload: { tenantId: "tenant_1", runId: "run_1" },
      options: { jobId: "run-run_1-code-1" },
    });
  });

  it("retries the planner with a fresh attempt on retryable failure", async () => {
    const { orchestrator, tx, publisher, agent } = makeHarness();

    tx.run.findUnique.mockResolvedValue(runRow());
    agent.plan.mockResolvedValue({
      ok: false,
      failure: { kind: "retryable", reason: "model timeout" },
    });

    await orchestrator.handlePlan({ tenantId: "tenant_1", runId: "run_1" });

    expect(tx.plan.create).not.toHaveBeenCalled();
    const update = tx.run.update.mock.calls.at(-1)![0].data;
    expect(update).toMatchObject({
      status: "PLANNING",
      attempt: 2,
      lastError: "model timeout",
    });
    expect(publisher.jobs.at(-1)!.options).toEqual({
      jobId: "run-run_1-plan-2",
    });
  });

  it("treats needsMoreContext as a replan", async () => {
    const { orchestrator, tx, publisher, agent } = makeHarness();

    tx.run.findUnique.mockResolvedValue(runRow());
    agent.plan.mockResolvedValue({
      ok: true,
      value: {
        ...planBlueprint,
        needsMoreContext: true,
        missingContext: ["Sentry stack trace"],
      },
    });

    await orchestrator.handlePlan({ tenantId: "tenant_1", runId: "run_1" });

    expect(tx.plan.create).toHaveBeenCalledOnce();
    const update = tx.run.update.mock.calls.at(-1)![0].data;
    expect(update).toMatchObject({
      status: "PLANNING",
      attempt: 2,
      replans: 1,
    });
    expect(publisher.jobs.at(-1)!.options).toEqual({
      jobId: "run-run_1-plan-2",
    });
  });

  it("no-ops when the run has already moved on (idempotent replay)", async () => {
    const { orchestrator, tx, publisher, agent } = makeHarness();

    tx.run.findUnique.mockResolvedValue(runRow({ status: "CODING" }));

    await orchestrator.handlePlan({ tenantId: "tenant_1", runId: "run_1" });

    expect(agent.plan).not.toHaveBeenCalled();
    expect(publisher.jobs).toHaveLength(0);
  });
});

describe("RunOrchestrator.handleCode", () => {
  it("stores the patch with file changes and advances to validation", async () => {
    const { orchestrator, tx, publisher } = makeHarness();

    tx.run.findUnique.mockResolvedValue(runRow({ status: "CODING" }));
    tx.plan.findFirst.mockResolvedValue({
      ...planBlueprint,
      missingContext: [],
    });

    await orchestrator.handleCode({ tenantId: "tenant_1", runId: "run_1" });

    const patchData = tx.patch.create.mock.calls[0]![0].data;
    expect(patchData).toMatchObject({
      runId: "run_1",
      attempt: 1,
      testsToRun: ["src/export.test.ts"],
    });
    expect(patchData.fileChanges.create).toEqual([
      {
        tenantId: "tenant_1",
        path: "src/export.ts",
        oldContent: "",
        newContent: "x",
      },
    ]);
    expect(publisher.jobs.at(-1)).toEqual({
      queue: "validate",
      payload: { tenantId: "tenant_1", runId: "run_1" },
      options: { jobId: "run-run_1-validate-1" },
    });
  });
});

describe("RunOrchestrator.handleValidate", () => {
  it("records a passing validation and opens the PR stage", async () => {
    const { orchestrator, tx, publisher } = makeHarness();

    tx.run.findUnique.mockResolvedValue(runRow({ status: "VALIDATING" }));
    tx.patch.findFirst.mockResolvedValue({
      ...patch,
      fileChanges: [
        {
          path: "src/export.ts",
          oldContent: "",
          newContent: "x",
        },
      ],
    });

    await orchestrator.handleValidate({ tenantId: "tenant_1", runId: "run_1" });

    expect(tx.validationRun.create.mock.calls[0]![0].data).toMatchObject({
      runId: "run_1",
      attempt: 1,
      status: "PASSED",
    });
    expect(publisher.jobs.at(-1)!.queue).toBe("pr");
    expect(publisher.jobs.at(-1)!.options).toEqual({
      jobId: "run-run_1-pr-1",
    });
  });

  it("returns FAILED validations to the coder with the error attached", async () => {
    const { orchestrator, tx, publisher, agent } = makeHarness();

    tx.run.findUnique.mockResolvedValue(runRow({ status: "VALIDATING" }));
    tx.patch.findFirst.mockResolvedValue({ ...patch, fileChanges: [] });
    agent.validate.mockResolvedValue({
      ok: true,
      value: {
        ...passedValidation,
        status: "FAILED",
        output: "3 tests failed",
      },
    });

    await orchestrator.handleValidate({ tenantId: "tenant_1", runId: "run_1" });

    const update = tx.run.update.mock.calls.at(-1)![0].data;
    expect(update).toMatchObject({
      status: "CODING",
      attempt: 2,
      lastError: "3 tests failed",
    });
    expect(publisher.jobs.at(-1)!.options).toEqual({
      jobId: "run-run_1-code-2",
    });
  });

  it("retries ERRORED validations in place (sandbox failure)", async () => {
    const { orchestrator, tx, publisher, agent } = makeHarness();

    tx.run.findUnique.mockResolvedValue(runRow({ status: "VALIDATING" }));
    tx.patch.findFirst.mockResolvedValue({ ...patch, fileChanges: [] });
    agent.validate.mockResolvedValue({
      ok: true,
      value: {
        ...passedValidation,
        status: "ERRORED",
        output: "sandbox crashed",
      },
    });

    await orchestrator.handleValidate({ tenantId: "tenant_1", runId: "run_1" });

    const update = tx.run.update.mock.calls.at(-1)![0].data;
    expect(update).toMatchObject({
      status: "VALIDATING",
      attempt: 2,
    });
    expect(publisher.jobs.at(-1)!.options).toEqual({
      jobId: "run-run_1-validate-2",
    });
  });

  it("escalates when the attempt budget is exhausted and flags the issue", async () => {
    const { orchestrator, tx, publisher, agent } = makeHarness();

    tx.run.findUnique.mockResolvedValue(
      runRow({ status: "VALIDATING", attempt: 3 }),
    );
    tx.patch.findFirst.mockResolvedValue({ ...patch, fileChanges: [] });
    agent.validate.mockResolvedValue({
      ok: true,
      value: { ...passedValidation, status: "FAILED", output: "still failing" },
    });

    await orchestrator.handleValidate({ tenantId: "tenant_1", runId: "run_1" });

    const update = tx.run.update.mock.calls.at(-1)![0].data;
    expect(update).toMatchObject({
      status: "ESCALATED",
      finishedAt: expect.any(Date),
    });
    expect(tx.issue.update).toHaveBeenCalledWith({
      where: { id: "issue_1" },
      data: { status: "ESCALATED" },
    });
    // Escalation is terminal: nothing new is enqueued.
    expect(publisher.jobs).toHaveLength(0);
  });
});

describe("RunOrchestrator.handlePr", () => {
  it("completes the run and flips the issue to PR_OPENED", async () => {
    const { orchestrator, tx } = makeHarness();

    tx.run.findUnique.mockResolvedValue(runRow({ status: "OPENING_PR" }));

    await orchestrator.handlePr({ tenantId: "tenant_1", runId: "run_1" });

    const update = tx.run.update.mock.calls.at(-1)![0].data;
    expect(update).toMatchObject({
      status: "SUCCEEDED",
      finishedAt: expect.any(Date),
    });
    expect(tx.issue.update).toHaveBeenCalledWith({
      where: { id: "issue_1" },
      data: { status: "PR_OPENED" },
    });
  });
});
