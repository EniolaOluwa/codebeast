import { Inject, Injectable, Logger } from "@nestjs/common";
import type {
  IssueContext,
  IssueStatus,
  PatchSubmission,
  PlanBlueprint,
  RunStage,
  ValidationResult,
} from "@repo/types";

import { TenantContext } from "../../common/context/tenant-context.ts";
import { NotFoundError, ValidationError } from "../../common/errors/errors.ts";
import { paginationMeta } from "../../common/pagination/pagination.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";
import {
  PIPELINE_ENQUEUER,
  type PipelineEnqueuer,
} from "../../workers/pipeline.constants.ts";
import type { PullRequestView, RunView } from "./dto.ts";

interface PullRequestInput {
  issueId: string;
  repositoryId: string;
  provider: "GITHUB" | "GITLAB";
  externalNumber: number | null;
  url: string | null;
  branch: string;
  baseBranch: string;
  status: "DRAFT" | "OPEN" | "MERGED" | "CLOSED";
  title: string;
  body: string;
}

function mapRun(row: {
  id: string;
  issueId: string;
  status: string;
  stage: string;
  attempt: number;
  model: string | null;
  confidence: number | null;
  error: string | null;
  replanned: boolean;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): RunView {
  return { ...row };
}

@Injectable()
export class RunService {
  private readonly logger = new Logger(RunService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    @Inject(PIPELINE_ENQUEUER) private readonly enqueuer: PipelineEnqueuer,
  ) {}

  async start(issueId: string): Promise<RunView> {
    const tenantId = this.tenantContext.requireTenantId();
    return this.startForTenant(tenantId, issueId);
  }

  async startForTenant(tenantId: string, issueId: string): Promise<RunView> {
    const run = await this.prisma.withTenantId(tenantId, async (tx) => {
      const issue = await tx.issue.findUnique({ where: { id: issueId } });
      if (!issue) {
        throw new NotFoundError("Issue");
      }
      const created = await tx.run.create({
        data: { tenantId, issueId, status: "QUEUED", stage: "PLANNING" },
      });
      await tx.issue.update({
        where: { id: issueId },
        data: { status: "PLANNING" },
      });
      return created;
    });

    await this.enqueuer.enqueueRun(run.id);
    return mapRun(run);
  }

  async listByIssue(
    issueId: string,
    page: number,
    limit: number,
  ): Promise<{
    data: RunView[];
    pagination: ReturnType<typeof paginationMeta>;
  }> {
    const result = await this.prisma.withTenant(async (tx) => {
      const [rows, total] = await Promise.all([
        tx.run.findMany({
          where: { issueId },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        tx.run.count({ where: { issueId } }),
      ]);
      return { rows, total };
    });

    return {
      data: result.rows.map(mapRun),
      pagination: paginationMeta(page, limit, result.total),
    };
  }

  async get(runId: string): Promise<Record<string, unknown>> {
    return this.prisma.withTenant(async (tx) => {
      const run = await tx.run.findUnique({
        where: { id: runId },
        include: {
          plan: true,
          patch: { include: { fileChanges: true } },
          validationRuns: { orderBy: { createdAt: "desc" } },
          pullRequest: true,
        },
      });
      if (!run) {
        throw new NotFoundError("Run");
      }
      return run;
    });
  }

  async getTenantId(runId: string): Promise<{
    tenantId: string;
    issueId: string;
    attempt: number;
    replanned: boolean;
  }> {
    const run = await this.prisma.client.run.findUnique({
      where: { id: runId },
      select: {
        tenantId: true,
        issueId: true,
        attempt: true,
        replanned: true,
      },
    });
    if (!run) {
      throw new NotFoundError("Run");
    }
    return run;
  }

  async buildContext(tenantId: string, runId: string): Promise<IssueContext> {
    return this.prisma.withTenantId(tenantId, async (tx) => {
      const run = await tx.run.findUnique({
        where: { id: runId },
        include: {
          issue: { include: { signals: true, repository: true } },
        },
      });

      const issue = run?.issue;
      if (!issue) {
        throw new NotFoundError("Issue");
      }

      const repository =
        issue.repository ??
        (await tx.repository.findFirst({ where: { isActive: true } }));
      if (!repository) {
        throw new ValidationError("Issue has no connected repository");
      }

      const sentrySignal = issue.signals.find(
        (signal) => signal.kind === "SENTRY_EVENT",
      );

      return {
        issueId: issue.id,
        tenantId,
        title: issue.title,
        summary: issue.summary,
        severity: issue.severity,
        correlationScore: issue.correlationScore,
        repository: {
          id: repository.id,
          fullName: repository.fullName,
          defaultBranch: repository.defaultBranch,
          provider: repository.provider,
        },
        signals: issue.signals.map((signal) => ({
          id: signal.id,
          kind: signal.kind,
          externalId: signal.externalId,
          source: signal.source,
          title: signal.title,
          body: signal.body,
          url: signal.url,
          metadata: signal.metadata as Record<string, unknown>,
          occurredAt: signal.occurredAt,
        })),
        sentryStack:
          (sentrySignal?.metadata as { stack?: string } | null)?.stack ?? null,
        jiraKey: issue.jiraKey,
        metadata: {},
      };
    });
  }

  async markStage(
    tenantId: string,
    runId: string,
    stage: RunStage,
    attempt: number,
  ): Promise<void> {
    await this.prisma.withTenantId(tenantId, (tx) =>
      tx.run.update({
        where: { id: runId },
        data: {
          status: "RUNNING",
          stage,
          attempt,
          startedAt: new Date(),
        },
      }),
    );
  }

  async savePlan(
    tenantId: string,
    runId: string,
    plan: PlanBlueprint,
    model: string,
  ): Promise<void> {
    await this.prisma.withTenantId(tenantId, async (tx) => {
      await tx.plan.upsert({
        where: { runId },
        create: {
          tenantId,
          runId,
          rootCause: plan.rootCause,
          filesToInspect: plan.filesToInspect,
          changeStrategy: plan.changeStrategy,
          testsToRun: plan.testsToRun,
          confidence: plan.confidence,
          needsMoreContext: plan.needsMoreContext,
          missingContext: plan.missingContext ?? [],
          raw: plan,
        },
        update: {
          rootCause: plan.rootCause,
          filesToInspect: plan.filesToInspect,
          changeStrategy: plan.changeStrategy,
          testsToRun: plan.testsToRun,
          confidence: plan.confidence,
          needsMoreContext: plan.needsMoreContext,
          missingContext: plan.missingContext ?? [],
          raw: plan,
        },
      });
      await tx.run.update({
        where: { id: runId },
        data: { model, confidence: plan.confidence },
      });
    });
  }

  async savePatch(
    tenantId: string,
    runId: string,
    patch: PatchSubmission,
  ): Promise<void> {
    await this.prisma.withTenantId(tenantId, async (tx) => {
      await tx.patch.upsert({
        where: { runId },
        create: {
          tenantId,
          runId,
          commitMessage: patch.commitMessage,
          rationale: patch.rationale,
          filesChanged: patch.changes.map((change) => change.path),
          raw: patch,
          fileChanges: {
            create: patch.changes.map((change) => ({
              tenantId,
              path: change.path,
              oldContent: change.oldContent,
              newContent: change.newContent,
            })),
          },
        },
        update: {
          commitMessage: patch.commitMessage,
          rationale: patch.rationale,
          filesChanged: patch.changes.map((change) => change.path),
          raw: patch,
          fileChanges: {
            deleteMany: {},
            create: patch.changes.map((change) => ({
              tenantId,
              path: change.path,
              oldContent: change.oldContent,
              newContent: change.newContent,
            })),
          },
        },
      });
    });
  }

  async saveValidation(
    tenantId: string,
    runId: string,
    result: ValidationResult,
  ): Promise<void> {
    const status = result.passed
      ? "PASSED"
      : result.testsPassed
        ? "FAILED"
        : "ERROR";

    await this.prisma.withTenantId(tenantId, (tx) =>
      tx.validationRun.create({
        data: {
          tenantId,
          runId,
          status,
          testsToRun: result.testsToRun,
          lintPassed: result.lintPassed,
          typecheckPassed: result.typecheckPassed,
          testsPassed: result.testsPassed,
          sandboxRunId: result.runId,
          output: result.output,
          durationMs: result.durationMs,
        },
      }),
    );
  }

  async bumpAttempt(
    tenantId: string,
    runId: string,
    attempt: number,
    replanned: boolean,
  ): Promise<void> {
    await this.prisma.withTenantId(tenantId, (tx) =>
      tx.run.update({
        where: { id: runId },
        data: { attempt, replanned },
      }),
    );
  }

  async markSucceeded(
    tenantId: string,
    runId: string,
    confidence: number,
  ): Promise<void> {
    await this.prisma.withTenantId(tenantId, (tx) =>
      tx.run.update({
        where: { id: runId },
        data: {
          status: "SUCCEEDED",
          stage: "PR",
          confidence,
          finishedAt: new Date(),
        },
      }),
    );
  }

  async markFailed(
    tenantId: string,
    runId: string,
    error: string,
  ): Promise<void> {
    await this.prisma.withTenantId(tenantId, async (tx) => {
      const run = await tx.run.update({
        where: { id: runId },
        data: {
          status: "FAILED",
          error,
          finishedAt: new Date(),
        },
      });
      await tx.issue.update({
        where: { id: run.issueId },
        data: { status: "FAILED" },
      });
    });
  }

  async markEscalated(
    tenantId: string,
    runId: string,
    reason: string,
  ): Promise<void> {
    await this.prisma.withTenantId(tenantId, async (tx) => {
      const run = await tx.run.update({
        where: { id: runId },
        data: {
          status: "ESCALATED",
          error: reason,
          finishedAt: new Date(),
        },
      });
      await tx.issue.update({
        where: { id: run.issueId },
        data: { status: "NEEDS_HUMAN" },
      });
    });
  }

  async createPullRequest(
    tenantId: string,
    runId: string,
    input: PullRequestInput,
  ): Promise<PullRequestView> {
    const record = await this.prisma.withTenantId(tenantId, async (tx) => {
      const pr = await tx.pullRequest.create({
        data: {
          tenantId,
          runId,
          issueId: input.issueId,
          repositoryId: input.repositoryId,
          provider: input.provider,
          externalNumber: input.externalNumber,
          url: input.url,
          branch: input.branch,
          baseBranch: input.baseBranch,
          status: input.status,
          title: input.title,
          body: input.body,
        },
      });
      await tx.issue.update({
        where: { id: input.issueId },
        data: { status: "PR_OPENED" },
      });
      return pr;
    });

    return {
      id: record.id,
      provider: record.provider,
      externalNumber: record.externalNumber,
      url: record.url,
      branch: record.branch,
      baseBranch: record.baseBranch,
      status: record.status,
      title: record.title,
      createdAt: record.createdAt,
    };
  }

  async setIssueStatus(
    tenantId: string,
    issueId: string,
    status: IssueStatus,
  ): Promise<void> {
    await this.prisma.withTenantId(tenantId, (tx) =>
      tx.issue.update({ where: { id: issueId }, data: { status } }),
    );
  }
}
