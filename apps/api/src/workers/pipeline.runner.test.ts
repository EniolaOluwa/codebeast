import type {
  IssueContext,
  PatchSubmission,
  PlanBlueprint,
  ValidationResult,
} from "@repo/types";
import { describe, expect, it, vi } from "vitest";

import type { AgentClient } from "../clients/agent.client.ts";
import type { GithubClient } from "../clients/github.client.ts";
import type { RunService } from "../modules/runs/run.service.ts";
import type { PrismaService } from "../prisma/prisma.service.ts";
import { PipelineRunner } from "./pipeline.runner.ts";

const context: IssueContext = {
  issueId: "issue-1",
  tenantId: "tenant-1",
  title: "CSV export fails",
  summary: null,
  severity: "HIGH",
  correlationScore: 0.9,
  repository: {
    id: "repo-1",
    fullName: "acme/app",
    defaultBranch: "main",
    provider: "GITHUB",
  },
  signals: [],
  sentryStack: null,
  jiraKey: null,
  metadata: {},
};

const plan: PlanBlueprint = {
  rootCause: "undefined row",
  filesToInspect: ["src/export.ts"],
  changeStrategy: "add empty guard",
  testsToRun: ["src/export.test.ts"],
  confidence: 0.9,
  needsMoreContext: false,
};

const patch: PatchSubmission = {
  changes: [{ path: "src/export.ts", oldContent: "a", newContent: "b" }],
  commitMessage: "fix(export): guard empty rows",
  testsToRun: ["src/export.test.ts"],
  rationale: "guard",
};

function validation(passed: boolean): ValidationResult {
  return {
    runId: "sandbox-1",
    passed,
    lintPassed: passed,
    typecheckPassed: passed,
    testsPassed: passed,
    testsToRun: ["src/export.test.ts"],
    output: passed ? "ok" : "boom",
    durationMs: 10,
  };
}

function makeRunner() {
  const runs = {
    getTenantId: vi.fn().mockResolvedValue({
      tenantId: "tenant-1",
      issueId: "issue-1",
      attempt: 1,
      replanned: false,
    }),
    buildContext: vi.fn().mockResolvedValue(context),
    markStage: vi.fn().mockResolvedValue(undefined),
    savePlan: vi.fn().mockResolvedValue(undefined),
    savePatch: vi.fn().mockResolvedValue(undefined),
    saveValidation: vi.fn().mockResolvedValue(undefined),
    bumpAttempt: vi.fn().mockResolvedValue(undefined),
    markSucceeded: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
    markEscalated: vi.fn().mockResolvedValue(undefined),
    createPullRequest: vi.fn().mockResolvedValue({}),
  };

  const agent = {
    plan: vi.fn(),
    code: vi.fn(),
    validate: vi.fn(),
  };

  const github = {
    createPullRequest: vi.fn().mockResolvedValue({
      number: 7,
      url: "https://github.com/acme/app/pull/7",
      branch: "codebeast/fix",
    }),
  };

  const prisma = {
    withTenantId: vi
      .fn()
      .mockImplementation(
        async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            repository: {
              findUniqueOrThrow: vi
                .fn()
                .mockResolvedValue({
                  fullName: "acme/app",
                  defaultBranch: "main",
                  installationId: "42",
                }),
            },
          }),
      ),
  };

  const runner = new PipelineRunner(
    runs as unknown as RunService,
    agent as unknown as AgentClient,
    github as unknown as GithubClient,
    prisma as unknown as PrismaService,
  );

  return { runner, runs, agent, github };
}

describe("PipelineRunner", () => {
  it("escalates when the planner is not confident", async () => {
    const { runner, runs, agent } = makeRunner();
    agent.plan.mockResolvedValue({
      plan: { ...plan, confidence: 0.2 },
      model: "deepseek",
    });

    await runner.run("run-1");

    expect(runs.markEscalated).toHaveBeenCalledOnce();
    expect(agent.code).not.toHaveBeenCalled();
    expect(runs.markSucceeded).not.toHaveBeenCalled();
  });

  it("completes plan → code → validate → PR", async () => {
    const { runner, runs, agent, github } = makeRunner();
    agent.plan.mockResolvedValue({ plan, model: "deepseek" });
    agent.code.mockResolvedValue({ patch, model: "deepseek" });
    agent.validate.mockResolvedValue(validation(true));

    await runner.run("run-1");

    expect(github.createPullRequest).toHaveBeenCalledOnce();
    expect(runs.createPullRequest).toHaveBeenCalledOnce();
    expect(runs.markSucceeded).toHaveBeenCalledOnce();
    expect(runs.markEscalated).not.toHaveBeenCalled();
  });

  it("retries the coder after a failed validation", async () => {
    const { runner, runs, agent } = makeRunner();
    agent.plan.mockResolvedValue({ plan, model: "deepseek" });
    agent.code.mockResolvedValue({ patch, model: "deepseek" });
    agent.validate
      .mockResolvedValueOnce(validation(false))
      .mockResolvedValueOnce(validation(true));

    await runner.run("run-1");

    expect(agent.code).toHaveBeenCalledTimes(2);
    expect(runs.bumpAttempt).toHaveBeenCalledOnce();
    expect(runs.markSucceeded).toHaveBeenCalledOnce();
  });

  it("escalates after exhausting all attempts", async () => {
    const { runner, runs, agent } = makeRunner();
    agent.plan.mockResolvedValue({ plan, model: "deepseek" });
    agent.code.mockResolvedValue({ patch, model: "deepseek" });
    agent.validate.mockResolvedValue(validation(false));

    await runner.run("run-1");

    expect(agent.code).toHaveBeenCalledTimes(3);
    expect(runs.markEscalated).toHaveBeenCalledOnce();
    expect(runs.markSucceeded).not.toHaveBeenCalled();
  });

  it("marks the run failed on an unexpected error", async () => {
    const { runner, runs, agent } = makeRunner();
    agent.plan.mockRejectedValue(new Error("agent exploded"));

    await runner.run("run-1");

    expect(runs.markFailed).toHaveBeenCalledOnce();
  });
});
