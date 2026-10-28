import { Injectable } from "@nestjs/common";
import type { PaginatedResponse, RunStatus } from "@repo/types";

import { NotFoundError } from "../../common/errors/errors.ts";
import { paginated, skipTake } from "../../common/pagination.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";

export interface RunView {
  id: string;
  issueId: string;
  status: RunStatus;
  attempt: number;
  replans: number;
  rootCause: string | null;
  confidence: number | null;
  lastError: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface RunDetailView extends RunView {
  plans: {
    id: string;
    attempt: number;
    rootCause: string;
    filesToInspect: string[];
    changeStrategy: string;
    testsToRun: string[];
    confidence: number;
    needsMoreContext: boolean;
    missingContext: string[];
    createdAt: string;
  }[];
  patches: {
    id: string;
    attempt: number;
    commitMessage: string;
    rationale: string;
    status: string;
    fileChanges: { path: string; oldContent: string; newContent: string }[];
    createdAt: string;
  }[];
  validations: {
    id: string;
    attempt: number;
    status: string;
    testsRun: string[];
    lintPassed: boolean | null;
    typesPassed: boolean | null;
    output: string | null;
    durationMs: number | null;
    createdAt: string;
  }[];
  pullRequest: {
    id: string;
    number: number;
    url: string;
    title: string;
    headBranch: string;
    baseBranch: string;
    status: string;
    createdAt: string;
  } | null;
}

interface RunRow {
  id: string;
  issueId: string;
  status: RunStatus;
  attempt: number;
  replans: number;
  rootCause: string | null;
  confidence: number | null;
  lastError: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}

function toRunView(row: RunRow): RunView {
  return {
    id: row.id,
    issueId: row.issueId,
    status: row.status,
    attempt: row.attempt,
    replans: row.replans,
    rootCause: row.rootCause,
    confidence: row.confidence,
    lastError: row.lastError,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class RunsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    tenantId: string,
    page: number,
    limit: number,
    filters: { issueId?: string; status?: RunStatus } = {},
  ): Promise<PaginatedResponse<RunView>> {
    const { skip, take } = skipTake(page, limit);
    const where = {
      tenantId,
      ...(filters.issueId ? { issueId: filters.issueId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    };

    const [rows, total] = await this.prisma.withTenant(tenantId, (tx) =>
      Promise.all([
        tx.run.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take,
        }),
        tx.run.count({ where }),
      ]),
    );

    return paginated(rows.map(toRunView), page, limit, total);
  }

  async get(tenantId: string, runId: string): Promise<RunDetailView> {
    const run = await this.prisma.withTenant(tenantId, (tx) =>
      tx.run.findFirst({
        where: { id: runId, tenantId },
        include: {
          plans: { orderBy: { attempt: "asc" } },
          patches: {
            orderBy: { attempt: "asc" },
            include: { fileChanges: true },
          },
          validations: { orderBy: { attempt: "asc" } },
          pullRequest: true,
        },
      }),
    );

    if (!run) {
      throw new NotFoundError("Run");
    }

    return {
      ...toRunView(run),
      plans: run.plans.map((plan) => ({
        id: plan.id,
        attempt: plan.attempt,
        rootCause: plan.rootCause,
        filesToInspect: plan.filesToInspect,
        changeStrategy: plan.changeStrategy,
        testsToRun: plan.testsToRun,
        confidence: plan.confidence,
        needsMoreContext: plan.needsMoreContext,
        missingContext: plan.missingContext,
        createdAt: plan.createdAt.toISOString(),
      })),
      patches: run.patches.map((patch) => ({
        id: patch.id,
        attempt: patch.attempt,
        commitMessage: patch.commitMessage,
        rationale: patch.rationale,
        status: patch.status,
        fileChanges: patch.fileChanges.map((change) => ({
          path: change.path,
          oldContent: change.oldContent,
          newContent: change.newContent,
        })),
        createdAt: patch.createdAt.toISOString(),
      })),
      validations: run.validations.map((validation) => ({
        id: validation.id,
        attempt: validation.attempt,
        status: validation.status,
        testsRun: validation.testsRun,
        lintPassed: validation.lintPassed,
        typesPassed: validation.typesPassed,
        output: validation.output,
        durationMs: validation.durationMs,
        createdAt: validation.createdAt.toISOString(),
      })),
      pullRequest: run.pullRequest
        ? {
            id: run.pullRequest.id,
            number: run.pullRequest.number,
            url: run.pullRequest.url,
            title: run.pullRequest.title,
            headBranch: run.pullRequest.headBranch,
            baseBranch: run.pullRequest.baseBranch,
            status: run.pullRequest.status,
            createdAt: run.pullRequest.createdAt.toISOString(),
          }
        : null,
    };
  }
}
