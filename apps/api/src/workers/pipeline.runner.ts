import { Injectable, Logger } from "@nestjs/common";
import type { PatchSubmission, ValidationResult } from "@repo/types";
import { MAX_ATTEMPTS } from "@repo/types";

import { AgentClient } from "../clients/agent.client.ts";
import { GithubClient } from "../clients/github.client.ts";
import { ExternalServiceError } from "../common/errors/errors.ts";
import { RunService } from "../modules/runs/run.service.ts";
import { PrismaService } from "../prisma/prisma.service.ts";

/**
 * Executes one agent-pipeline run: planner → coder ⇄ validator → PR.
 * Implements the retry budget and escalation rules from root AGENTS.md §6.4.
 */
@Injectable()
export class PipelineRunner {
  private readonly logger = new Logger(PipelineRunner.name);

  constructor(
    private readonly runs: RunService,
    private readonly agent: AgentClient,
    private readonly github: GithubClient,
    private readonly prisma: PrismaService,
  ) {}

  async run(runId: string): Promise<void> {
    const { tenantId, issueId } = await this.runs.getTenantId(runId);

    try {
      const context = await this.runs.buildContext(tenantId, runId);

      await this.runs.markStage(tenantId, runId, "PLANNING", 1);
      const { plan, model } = await this.agent.plan(context);
      await this.runs.savePlan(tenantId, runId, plan, model);

      if (plan.needsMoreContext || plan.confidence < 0.5) {
        await this.runs.markEscalated(
          tenantId,
          runId,
          "Planner needs more context or confidence < 0.5",
        );
        return;
      }

      let attempt = 1;
      let previousError: string | null = null;
      let patch: PatchSubmission | null = null;
      let validation: ValidationResult | null = null;

      while (attempt <= MAX_ATTEMPTS) {
        await this.runs.markStage(
          tenantId,
          runId,
          attempt === 1 ? "CODING" : "VALIDATING",
          attempt,
        );

        const code = await this.agent.code({
          context,
          plan,
          previousError,
        });
        const submitted = code.patch;
        patch = submitted;
        await this.runs.savePatch(tenantId, runId, submitted);

        await this.runs.markStage(tenantId, runId, "VALIDATING", attempt);
        const result = await this.agent.validate({
          context,
          patch: submitted,
        });
        validation = result;
        await this.runs.saveValidation(tenantId, runId, result);

        if (result.passed) {
          break;
        }

        previousError = result.output;
        attempt += 1;
        await this.runs.bumpAttempt(tenantId, runId, attempt, false);
      }

      if (!validation?.passed || !patch) {
        await this.runs.markEscalated(
          tenantId,
          runId,
          `Exhausted ${MAX_ATTEMPTS} attempts without a passing validation`,
        );
        return;
      }

      await this.runs.markStage(tenantId, runId, "PR", attempt);
      await this.openPullRequest(
        tenantId,
        runId,
        issueId,
        context.repository.id,
        patch,
        plan.rootCause,
      );
      await this.runs.markSucceeded(tenantId, runId, plan.confidence);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown pipeline error";
      this.logger.error(`Run ${runId} failed: ${message}`);

      if (error instanceof ExternalServiceError) {
        await this.runs.markEscalated(tenantId, runId, message);
        return;
      }

      await this.runs.markFailed(tenantId, runId, message);
    }
  }

  private async openPullRequest(
    tenantId: string,
    runId: string,
    issueId: string,
    repositoryId: string,
    patch: PatchSubmission,
    rootCause: string,
  ): Promise<void> {
    const repository = await this.prisma.withTenantId(tenantId, (tx) =>
      tx.repository.findUniqueOrThrow({ where: { id: repositoryId } }),
    );

    const branch = `codebeast/issue-${issueId.slice(-8)}-run-${runId.slice(-6)}`;

    const created = await this.github.createPullRequest({
      fullName: repository.fullName,
      installationId: repository.installationId,
      baseBranch: repository.defaultBranch,
      branch,
      title: patch.commitMessage,
      body: `${patch.rationale}\n\n## Root cause\n\n${rootCause}`,
      commitMessage: patch.commitMessage,
      changes: patch.changes.map((change) => ({
        path: change.path,
        newContent: change.newContent,
      })),
    });

    await this.runs.createPullRequest(tenantId, runId, {
      issueId,
      repositoryId,
      provider: "GITHUB",
      externalNumber: created.number,
      url: created.url,
      branch: created.branch,
      baseBranch: repository.defaultBranch,
      status: "DRAFT",
      title: patch.commitMessage,
      body: patch.rationale,
    });
  }
}
