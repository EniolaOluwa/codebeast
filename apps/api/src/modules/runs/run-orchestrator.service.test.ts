import type { ConfigService } from "@nestjs/config";
import type {
  IssueContext,
  PatchSubmission,
  PlanBlueprint,
  ValidationResult,
} from "@repo/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentClient, AgentResult } from "../../clients/agent.client.ts";
import type {
  CreatedPullRequest,
  CreatePullRequestInput,
} from "../../clients/github.client.ts";
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
    confidence: null,
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
    issue: { update: vi.fn(), findFirst: vi.fn() },
    pullRequest: {
      findUnique: vi.fn(),
      createMany: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    ticket: { createMany: vi.fn() },
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

  const github = {
    createPullRequest: vi.fn(
      async (input: CreatePullRequestInput): Promise<CreatedPullRequest> => ({
        number: 42,
        url: "https://github.com/acme/web/pull/42",
        headBranch: input.headBranch,
        baseBranch: "main",
      }),
    ),
  };

  const jira = {
    createIssue: vi.fn(
      async (_input: {
        tenantId: string;
        summary: string;
        description: string;
      }) => ({
        key: "ENG-201",
        url: "https://stub.atlassian.net/browse/ENG-201",
        projectKey: "ENG",
        issueType: "Bug",
      }),
    ),
    scan: vi.fn(async (): Promise<never[]> => []),
  };

  const publisher = new RecordingPublisher();

  const ruleEngine = {
    evaluateDetection: vi.fn().mockResolvedValue({ action: "DETECT" as const }),
    evaluateAutomation: vi.fn().mockResolvedValue(null),
  };

  const config = {
    getOrThrow: (key: string): unknown =>
      key === "INGEST_COALESCE_MS" ? 30_000 : undefined,
  } as unknown as ConfigService;

  const orchestrator = new RunOrchestrator(
    prisma,
    triage,
    agent,
    publisher,
    github as never,
    jira as never,
    ruleEngine as never,
    config,
  );

  return {
    orchestrator,
    prisma,
    tx,
    triage,
    agent,
    github,
    jira,
    ruleEngine,
    publisher,
  };
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

    tx.issue.findFirst.mockResolvedValue({ status: "NEW" });
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

    tx.issue.findFirst.mockResolvedValue({ status: "NEW" });
    tx.run.findFirst.mockResolvedValue({ id: "run_open" });

    await orchestrator.handleTriage({
      tenantId: "tenant_1",
      issueId: "issue_1",
    });

    expect(tx.run.create).not.toHaveBeenCalled();
    expect(publisher.jobs).toHaveLength(0);
    expect(triage.buildIssueContext).not.toHaveBeenCalled();
  });

  it("skips reports that are not actionable (ignored, resolved, …)", async () => {
    const { orchestrator, tx, publisher, triage } = makeHarness();

    tx.issue.findFirst.mockResolvedValue({ status: "IGNORED" });

    await orchestrator.handleTriage({
      tenantId: "tenant_1",
      issueId: "issue_1",
    });

    expect(tx.run.create).not.toHaveBeenCalled();
    expect(tx.run.findFirst).not.toHaveBeenCalled();
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
  it("records a passing validation and ends the compute run (issue READY)", async () => {
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
    expect(tx.run.update.mock.calls.at(-1)![0].data).toMatchObject({
      status: "SUCCEEDED",
      finishedAt: expect.any(Date),
    });
    expect(tx.issue.update).toHaveBeenCalledWith({
      where: { id: "issue_1" },
      data: { status: "READY" },
    });
    // Compute is done: nothing is queued; shipping is a separate action.
    expect(publisher.jobs).toHaveLength(0);
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

describe("RunOrchestrator.handleShipPr", () => {
  function readyIssue(overrides: Record<string, unknown> = {}) {
    return {
      id: "issue_1",
      status: "READY",
      repositoryId: "repo_1",
      repository: { fullName: "acme/web", defaultBranch: "main" },
      ...overrides,
    };
  }

  it("opens the PR, records it and flips the issue to PR_OPENED", async () => {
    const { orchestrator, tx, github } = makeHarness();

    tx.issue.findFirst.mockResolvedValue(readyIssue());
    tx.run.findFirst.mockResolvedValue({ id: "run_1" });
    tx.pullRequest.findUnique.mockResolvedValue(null);
    tx.patch.findFirst.mockResolvedValue({
      ...patch,
      fileChanges: [
        { path: "src/export.ts", oldContent: "", newContent: "// fixed" },
      ],
    });
    tx.plan.findFirst.mockResolvedValue({
      ...planBlueprint,
      missingContext: [],
    });

    await orchestrator.handleShipPr({
      tenantId: "tenant_1",
      issueId: "issue_1",
    });

    const createInput = github.createPullRequest.mock.calls[0]![0];
    expect(createInput).toMatchObject({
      tenantId: "tenant_1",
      repository: { fullName: "acme/web", defaultBranch: "main" },
      headBranch: "codebeast/fix-run_1",
      title: "fix: export",
    });
    expect(createInput.files).toEqual([
      { path: "src/export.ts", content: "// fixed" },
    ]);

    expect(tx.pullRequest.createMany.mock.calls[0]![0].data[0]).toMatchObject({
      runId: "run_1",
      repositoryId: "repo_1",
      number: 42,
      status: "OPEN",
    });
    expect(tx.issue.update).toHaveBeenCalledWith({
      where: { id: "issue_1" },
      data: { status: "PR_OPENED" },
    });
  });

  it("skips when the issue is not READY", async () => {
    const { orchestrator, tx, github } = makeHarness();

    tx.issue.findFirst.mockResolvedValue(readyIssue({ status: "RUNNING" }));

    await orchestrator.handleShipPr({
      tenantId: "tenant_1",
      issueId: "issue_1",
    });

    expect(github.createPullRequest).not.toHaveBeenCalled();
    expect(tx.issue.update).not.toHaveBeenCalled();
  });

  it("is idempotent: an existing PR row only re-flips the issue", async () => {
    const { orchestrator, tx, github } = makeHarness();

    tx.issue.findFirst.mockResolvedValue(readyIssue());
    tx.run.findFirst.mockResolvedValue({ id: "run_1" });
    tx.pullRequest.findUnique.mockResolvedValue({ id: "pr_1" });

    await orchestrator.handleShipPr({
      tenantId: "tenant_1",
      issueId: "issue_1",
    });

    expect(github.createPullRequest).not.toHaveBeenCalled();
    expect(tx.issue.update).toHaveBeenCalledWith({
      where: { id: "issue_1" },
      data: { status: "PR_OPENED" },
    });
  });

  it("refuses to ship without a mapped repository", async () => {
    const { orchestrator, tx } = makeHarness();

    tx.issue.findFirst.mockResolvedValue(
      readyIssue({ repositoryId: null, repository: null }),
    );

    await expect(
      orchestrator.handleShipPr({ tenantId: "tenant_1", issueId: "issue_1" }),
    ).rejects.toThrow(/no repository mapped/i);
  });
});

describe("RunOrchestrator automation (rules engine)", () => {
  function validatingRun(confidence: number | null) {
    return runRow({ status: "VALIDATING", confidence });
  }

  const automationActions = {
    createTicket: true,
    openPr: true,
    repositoryId: "repo_1",
    minConfidence: 0.5,
    dailyPrLimit: 5,
  };

  async function runToSuccess() {
    const harness = makeHarness();

    harness.tx.run.findUnique.mockResolvedValue(validatingRun(0.9));
    harness.tx.patch.findFirst.mockResolvedValue({
      ...patch,
      fileChanges: [{ path: "src/export.ts", oldContent: "", newContent: "x" }],
    });
    harness.ruleEngine.evaluateAutomation.mockResolvedValue({
      ruleId: "rule_1",
      actions: automationActions,
    });
    harness.tx.issue.findFirst.mockResolvedValue({
      id: "issue_1",
      title: "Export broken",
      signalCount: 1,
      repositoryId: null,
      ticket: null,
    });

    await harness.orchestrator.handleValidate({
      tenantId: "tenant_1",
      runId: "run_1",
    });

    return harness;
  }

  it("publishes ticket and PR jobs when a rule matches, applying its repository", async () => {
    const { publisher, tx } = await runToSuccess();

    expect(publisher.jobs.map((job) => job.queue)).toEqual(["ticket", "pr"]);
    expect(publisher.jobs[1]!.options).toEqual({
      jobId: "ship-issue_1-pr",
    });
    expect(tx.issue.update).toHaveBeenCalledWith({
      where: { id: "issue_1" },
      data: { repositoryId: "repo_1" },
    });
  });

  it("skips the PR below the confidence floor but still tickets", async () => {
    const harness = makeHarness();

    harness.tx.run.findUnique.mockResolvedValue(validatingRun(0.4));
    harness.tx.patch.findFirst.mockResolvedValue({
      ...patch,
      fileChanges: [],
    });
    harness.ruleEngine.evaluateAutomation.mockResolvedValue({
      ruleId: "rule_1",
      actions: automationActions,
    });
    harness.tx.issue.findFirst.mockResolvedValue({
      id: "issue_1",
      title: "Export broken",
      signalCount: 1,
      repositoryId: "repo_1",
      ticket: null,
    });

    await harness.orchestrator.handleValidate({
      tenantId: "tenant_1",
      runId: "run_1",
    });

    expect(harness.publisher.jobs.map((job) => job.queue)).toEqual(["ticket"]);
  });

  it("skips the PR when the daily limit is reached", async () => {
    const scoped = makeHarness();

    scoped.tx.run.findUnique.mockResolvedValue(validatingRun(0.9));
    scoped.tx.patch.findFirst.mockResolvedValue({
      ...patch,
      fileChanges: [],
    });
    scoped.ruleEngine.evaluateAutomation.mockResolvedValue({
      ruleId: "rule_1",
      actions: automationActions,
    });
    scoped.tx.issue.findFirst.mockResolvedValue({
      id: "issue_1",
      title: "Export broken",
      signalCount: 1,
      repositoryId: "repo_1",
      ticket: null,
    });
    scoped.tx.pullRequest.count.mockResolvedValue(5);

    await scoped.orchestrator.handleValidate({
      tenantId: "tenant_1",
      runId: "run_1",
    });

    expect(scoped.publisher.jobs.map((job) => job.queue)).toEqual(["ticket"]);
  });

  it("does not re-ticket when a ticket already exists", async () => {
    const harness = makeHarness();

    harness.tx.run.findUnique.mockResolvedValue(validatingRun(0.9));
    harness.tx.patch.findFirst.mockResolvedValue({
      ...patch,
      fileChanges: [],
    });
    harness.ruleEngine.evaluateAutomation.mockResolvedValue({
      ruleId: "rule_1",
      actions: automationActions,
    });
    harness.tx.issue.findFirst.mockResolvedValue({
      id: "issue_1",
      title: "Export broken",
      signalCount: 1,
      repositoryId: "repo_1",
      ticket: { id: "ticket_1" },
    });

    await harness.orchestrator.handleValidate({
      tenantId: "tenant_1",
      runId: "run_1",
    });

    expect(harness.publisher.jobs.map((job) => job.queue)).toEqual(["pr"]);
  });
});

describe("RunOrchestrator.handleCreateTicket", () => {
  function ticketingIssue(overrides: Record<string, unknown> = {}) {
    return {
      id: "issue_1",
      status: "READY",
      title: "Export broken",
      summary: "Customer reports the export button does nothing.",
      ticket: null,
      signals: [
        {
          provider: "SENTRY",
          title: "TypeError in export",
          url: "https://sentry.io/issues/42",
        },
      ],
      runs: [
        {
          rootCause: "row is undefined before the guard",
          pullRequest: { url: "https://github.com/acme/web/pull/9" },
        },
      ],
      ...overrides,
    };
  }

  it("creates the ticket with evidence and flips READY → TICKETED", async () => {
    const { orchestrator, tx, jira } = makeHarness();

    tx.issue.findFirst.mockResolvedValue(ticketingIssue());

    await orchestrator.handleCreateTicket({
      tenantId: "tenant_1",
      issueId: "issue_1",
    });

    expect(jira.createIssue).toHaveBeenCalledWith({
      tenantId: "tenant_1",
      summary: "Export broken",
      description: expect.stringContaining("row is undefined before the guard"),
    });
    const description = jira.createIssue.mock.calls[0]![0].description;
    expect(description).toContain("Customer reports the export button");
    expect(description).toContain("SENTRY: TypeError in export");
    expect(description).toContain("https://sentry.io/issues/42");
    expect(description).toContain("https://github.com/acme/web/pull/9");

    expect(tx.ticket.createMany.mock.calls[0]![0].data[0]).toMatchObject({
      issueId: "issue_1",
      key: "ENG-201",
      projectKey: "ENG",
      issueType: "Bug",
    });
    expect(tx.issue.update).toHaveBeenCalledWith({
      where: { id: "issue_1" },
      data: { status: "TICKETED" },
    });
  });

  it("is idempotent: an existing ticket only re-flips the status", async () => {
    const { orchestrator, tx, jira } = makeHarness();

    tx.issue.findFirst.mockResolvedValue(
      ticketingIssue({ ticket: { id: "ticket_1" } }),
    );

    await orchestrator.handleCreateTicket({
      tenantId: "tenant_1",
      issueId: "issue_1",
    });

    expect(jira.createIssue).not.toHaveBeenCalled();
    expect(tx.ticket.createMany).not.toHaveBeenCalled();
    expect(tx.issue.update).toHaveBeenCalledWith({
      where: { id: "issue_1" },
      data: { status: "TICKETED" },
    });
  });

  it("skips issues that cannot be shipped yet", async () => {
    const { orchestrator, tx, jira } = makeHarness();

    tx.issue.findFirst.mockResolvedValue(ticketingIssue({ status: "RUNNING" }));

    await orchestrator.handleCreateTicket({
      tenantId: "tenant_1",
      issueId: "issue_1",
    });

    expect(jira.createIssue).not.toHaveBeenCalled();
    expect(tx.issue.update).not.toHaveBeenCalled();
  });
});
