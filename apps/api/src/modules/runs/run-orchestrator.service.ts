import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  type IssueContext,
  MAX_ATTEMPTS,
  type RepositoryCheckout,
  type RunStatus,
  truncateToBytes,
} from "@repo/types";

import {
  AGENT_CLIENT,
  type AgentClient,
  type AgentFailure,
} from "../../clients/agent.client.ts";
import {
  GITHUB_CLIENT,
  type GitHubClient,
} from "../../clients/github.client.ts";
import { GitHubInstallationTokenService } from "../../clients/github-installation-token.service.ts";
import { JIRA_CLIENT, type JiraClient } from "../../clients/jira.client.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";
import {
  type IngestJob,
  QUEUE_PUBLISHER,
  type QueueName,
  type QueuePublisher,
  type RunStageJob,
  type ShipPrJob,
  type TicketJob,
  type TriageJob,
} from "../../queues/queue.types.ts";
import { AuditService } from "../audit/audit.service.ts";
import { MetricsService } from "../metrics/metrics.service.ts";
import { RuleEngine } from "../rules/rule-engine.service.ts";
import { TriageService } from "../triage/triage.service.ts";
import {
  beginRun,
  decideAfterStage,
  type RunState,
  type StageOptions,
  type StageResult,
  TERMINAL_RUN_STATUSES,
} from "./run-state-machine.ts";

/** Status -> queue for "the run should execute this stage next". */
const QUEUE_FOR_STATUS: Partial<Record<RunStatus, QueueName>> = {
  PLANNING: "plan",
  CODING: "code",
  VALIDATING: "validate",
};

interface RunRow {
  id: string;
  tenantId: string;
  issueId: string;
  status: RunStatus;
  attempt: number;
  replans: number;
  maxAttempts: number;
  lastError: string | null;
  confidence: number | null;
}

/**
 * All run orchestration logic, independent of BullMQ. Workers are thin
 * adapters over these handlers; tests drive them directly or through an
 * in-memory queue.
 *
 * Every handler is idempotent: it checks that the run is in the stage it is
 * about to execute and no-ops otherwise, so replayed or duplicated jobs can
 * never advance a run twice.
 */
@Injectable()
export class RunOrchestrator {
  private readonly logger = new Logger(RunOrchestrator.name);
  private readonly coalesceMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly triage: TriageService,
    @Inject(AGENT_CLIENT) private readonly agent: AgentClient,
    @Inject(QUEUE_PUBLISHER) private readonly publisher: QueuePublisher,
    @Inject(GITHUB_CLIENT) private readonly github: GitHubClient,
    @Inject(JIRA_CLIENT) private readonly jira: JiraClient,
    private readonly ruleEngine: RuleEngine,
    private readonly githubTokens: GitHubInstallationTokenService,
    config: ConfigService,
    @Optional() private readonly audit?: AuditService,
    @Optional() private readonly metrics?: MetricsService,
  ) {
    this.coalesceMs = config.getOrThrow<number>("INGEST_COALESCE_MS");
  }

  /** Ingestion → coalesced triage: one delayed triage job per issue/window. */
  async handleIngest(job: IngestJob): Promise<void> {
    await this.publisher.publish(
      "triage",
      { tenantId: job.tenantId, issueId: job.issueId },
      // BullMQ forbids ':' in custom job ids.
      { jobId: `triage-${job.issueId}`, delayMs: this.coalesceMs },
    );
  }

  async handleTriage(job: TriageJob): Promise<void> {
    // Only reports that are actually actionable compute (detection rules and
    // the ignore action can park a report outside this set).
    const issue = await this.prisma.withTenant(job.tenantId, (tx) =>
      tx.issue.findFirst({
        where: { id: job.issueId, tenantId: job.tenantId },
        select: { status: true },
      }),
    );

    if (!issue) {
      this.logger.warn(`triage skipped: issue ${job.issueId} not found`);
      return;
    }

    if (!["NEW", "TRIAGED"].includes(issue.status)) {
      this.logger.log(
        `triage skipped: issue ${job.issueId} is ${issue.status}`,
      );
      return;
    }

    const existing = await this.prisma.withTenant(job.tenantId, async (tx) =>
      tx.run.findFirst({
        where: {
          issueId: job.issueId,
          status: { notIn: [...TERMINAL_RUN_STATUSES] },
        },
        select: { id: true },
      }),
    );

    if (existing) {
      this.logger.log(
        `triage skipped for issue ${job.issueId}: run ${existing.id} is already open`,
      );
      return;
    }

    await this.startRun(job.tenantId, job.issueId);
  }

  /**
   * Creates a run for the issue and publishes its first stage. Used by the
   * triage handler and by the manual retry action.
   */
  async startRun(
    tenantId: string,
    issueId: string,
  ): Promise<{ runId: string }> {
    // Build (and cache) the bounded issue context before any model call.
    await this.triage.buildIssueContext(tenantId, issueId);

    const start = beginRun();

    const run = await this.prisma.withTenant(tenantId, async (tx) => {
      const created = await tx.run.create({
        data: {
          tenantId,
          issueId,
          status: "QUEUED",
          attempt: 0,
          maxAttempts: MAX_ATTEMPTS,
          startedAt: new Date(),
        },
        select: { id: true },
      });

      await tx.run.update({
        where: { id: created.id },
        data: { status: start.status, attempt: start.attempt },
      });

      await tx.issue.update({
        where: { id: issueId },
        data: { status: "RUNNING" },
      });

      return created;
    });

    await this.publishStage(tenantId, run.id, start.status, start.attempt);

    return { runId: run.id };
  }

  async handlePlan(job: RunStageJob): Promise<void> {
    const run = await this.loadRun(job.tenantId, job.runId);

    if (!run || run.status !== "PLANNING") {
      return;
    }

    const context = await this.triage.buildIssueContext(
      job.tenantId,
      run.issueId,
    );
    const checkout = await this.resolveCheckout(job.tenantId, context);
    if (context.repository && !checkout) {
      await this.applyDecision(run, "PLANNING", "retryable", {
        reason:
          "repository linked but no GitHub installation token available for checkout",
      });
      return;
    }

    const result = await this.agent.plan({
      context,
      ...(checkout ? { checkout } : {}),
    });

    if (!result.ok) {
      await this.applyDecision(
        run,
        "PLANNING",
        this.mapFailure(result.failure),
        {
          reason: result.failure.reason,
        },
      );
      return;
    }

    const plan = result.value;
    const outcome: StageResult = plan.needsMoreContext
      ? "needs_replan"
      : "passed";

    await this.prisma.withTenant(job.tenantId, async (tx) => {
      await tx.plan.create({
        data: {
          tenantId: job.tenantId,
          runId: run.id,
          attempt: run.attempt,
          rootCause: plan.rootCause,
          filesToInspect: plan.filesToInspect,
          changeStrategy: plan.changeStrategy,
          testsToRun: plan.testsToRun,
          confidence: plan.confidence,
          needsMoreContext: plan.needsMoreContext,
          missingContext: plan.missingContext ?? [],
        },
      });

      await tx.run.update({
        where: { id: run.id },
        data: {
          rootCause: plan.rootCause,
          confidence: plan.confidence,
        },
      });
    });

    await this.applyDecision(run, "PLANNING", outcome, {
      reason: plan.needsMoreContext
        ? `planner requested more context: ${(plan.missingContext ?? []).join(", ")}`
        : undefined,
    });
  }

  async handleCode(job: RunStageJob): Promise<void> {
    const run = await this.loadRun(job.tenantId, job.runId);

    if (!run || run.status !== "CODING") {
      return;
    }

    const plan = await this.latestPlan(job.tenantId, run.id);

    if (!plan) {
      await this.applyDecision(run, "CODING", "failed", {
        reason: "no plan on record for this run",
      });
      return;
    }

    const context = await this.triage.buildIssueContext(
      job.tenantId,
      run.issueId,
    );
    const checkout = await this.resolveCheckout(job.tenantId, context);
    if (context.repository && !checkout) {
      await this.applyDecision(run, "CODING", "retryable", {
        reason:
          "repository linked but no GitHub installation token available for checkout",
      });
      return;
    }

    const result = await this.agent.code({
      context,
      plan,
      ...(run.lastError ? { previousError: run.lastError } : {}),
      ...(checkout ? { checkout } : {}),
    });

    if (!result.ok) {
      await this.applyDecision(run, "CODING", this.mapFailure(result.failure), {
        reason: result.failure.reason,
      });
      return;
    }

    const patch = result.value;

    await this.prisma.withTenant(job.tenantId, async (tx) => {
      await tx.patch.create({
        data: {
          tenantId: job.tenantId,
          runId: run.id,
          attempt: run.attempt,
          commitMessage: patch.commitMessage,
          testsToRun: patch.testsToRun,
          rationale: patch.rationale,
          fileChanges: {
            create: patch.changes.map((change) => ({
              tenantId: job.tenantId,
              path: change.path,
              oldContent: change.oldContent,
              newContent: change.newContent,
            })),
          },
        },
      });
    });

    await this.applyDecision(run, "CODING", "passed");
  }

  async handleValidate(job: RunStageJob): Promise<void> {
    const run = await this.loadRun(job.tenantId, job.runId);

    if (!run || run.status !== "VALIDATING") {
      return;
    }

    const patch = await this.latestPatch(job.tenantId, run.id);
    const context = await this.triage.buildIssueContext(
      job.tenantId,
      run.issueId,
    );
    const checkout = await this.resolveCheckout(job.tenantId, context);
    if (context.repository && !checkout) {
      await this.applyDecision(run, "VALIDATING", "retryable", {
        reason:
          "repository linked but no GitHub installation token available for checkout",
        retryTo: "VALIDATING",
      });
      return;
    }

    const result = patch
      ? await this.agent.validate({
          patch,
          context,
          ...(checkout ? { checkout } : {}),
        })
      : {
          ok: false as const,
          failure: {
            kind: "retryable" as const,
            reason: "no patch on record for this run",
          },
        };

    if (!result.ok) {
      // Sandbox/infra failure: retry the validator itself. A "needs_replan"
      // from validation is treated as a normal test failure back to the coder.
      const outcome: StageResult =
        result.failure.kind === "terminal" ? "failed" : "retryable";
      const options: StageOptions =
        result.failure.kind === "terminal"
          ? { reason: result.failure.reason }
          : { reason: result.failure.reason, retryTo: "VALIDATING" };

      await this.applyDecision(run, "VALIDATING", outcome, options);
      return;
    }

    const validation = result.value;

    await this.prisma.withTenant(job.tenantId, async (tx) => {
      await tx.validationRun.create({
        data: {
          tenantId: job.tenantId,
          runId: run.id,
          attempt: run.attempt,
          status: validation.status,
          testsRun: validation.testsRun,
          lintPassed: validation.lintPassed,
          typesPassed: validation.typesPassed,
          output: validation.output,
          durationMs: validation.durationMs ?? null,
          sandboxRunId: validation.sandboxRunId ?? null,
        },
      });
    });

    switch (validation.status) {
      case "PASSED":
        await this.applyDecision(run, "VALIDATING", "passed");
        return;
      case "FAILED":
        // Root AGENTS.md §6.3: back to the coder, same plan, error appended.
        await this.applyDecision(run, "VALIDATING", "retryable", {
          retryTo: "CODING",
          reason: validation.output || "validation failed",
        });
        return;
      case "ERRORED":
        await this.applyDecision(run, "VALIDATING", "retryable", {
          reason: validation.output || "validator could not run",
        });
        return;
    }
  }

  /**
   * Ship step: opens the pull request for a READY issue. Runs as a queue job
   * so BullMQ retries/backoff apply to GitHub flakiness. Idempotent per run.
   */
  async handleShipPr(job: ShipPrJob): Promise<void> {
    const issue = await this.prisma.withTenant(job.tenantId, (tx) =>
      tx.issue.findFirst({
        where: { id: job.issueId, tenantId: job.tenantId },
        include: {
          repository: {
            select: { fullName: true, defaultBranch: true },
          },
        },
      }),
    );

    if (!issue) {
      this.logger.warn(`ship skipped: issue ${job.issueId} not found`);
      return;
    }

    if (issue.status === "PR_OPENED" || issue.status === "RESOLVED") {
      this.logger.log(
        `ship skipped: issue ${issue.id} is already ${issue.status}`,
      );
      return;
    }

    if (issue.status !== "READY" && issue.status !== "TICKETED") {
      this.logger.warn(
        `ship skipped: issue ${issue.id} is ${issue.status}, expected READY or TICKETED`,
      );
      return;
    }

    if (!issue.repository || !issue.repositoryId) {
      throw new Error(
        `Issue ${issue.id} has no repository mapped — cannot open a pull request`,
      );
    }

    const run = await this.prisma.withTenant(job.tenantId, (tx) =>
      tx.run.findFirst({
        where: { issueId: issue.id, status: "SUCCEEDED" },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      }),
    );

    if (!run) {
      throw new Error(`No successful run for issue ${issue.id}`);
    }

    const already = await this.prisma.withTenant(job.tenantId, (tx) =>
      tx.pullRequest.findUnique({
        where: { runId: run.id },
        select: { id: true },
      }),
    );

    if (already) {
      // A previous attempt recorded the PR but crashed before the flip.
      await this.markShipped(job.tenantId, issue.id);
      return;
    }

    const patch = await this.latestPatch(job.tenantId, run.id);

    if (!patch) {
      throw new Error(`No patch on record for run ${run.id}`);
    }

    const plan = await this.latestPlan(job.tenantId, run.id);
    const created = await this.github.createPullRequest({
      tenantId: job.tenantId,
      repository: {
        fullName: issue.repository.fullName,
        defaultBranch: issue.repository.defaultBranch,
      },
      headBranch: `codebeast/fix-${run.id.slice(-8)}`,
      title: patch.commitMessage,
      body: [
        "## Summary",
        patch.rationale,
        "",
        "## Root cause",
        plan?.rootCause ?? "Not recorded",
        "",
        "_Opened ready for review by CodeBeast._",
      ].join("\n"),
      files: patch.changes.map((change) => ({
        path: change.path,
        content: change.newContent,
      })),
    });

    await this.prisma.withTenant(job.tenantId, async (tx) => {
      await tx.pullRequest.createMany({
        data: [
          {
            tenantId: job.tenantId,
            runId: run.id,
            repositoryId: issue.repositoryId!,
            number: created.number,
            url: created.url,
            title: patch.commitMessage,
            headBranch: created.headBranch,
            baseBranch: created.baseBranch,
            status: "OPEN",
          },
        ],
        skipDuplicates: true,
      });

      // skipDuplicates can swallow a (repositoryId, number) conflict — never
      // flip the issue without a persisted row.
      const persisted = await tx.pullRequest.findUnique({
        where: { runId: run.id },
        select: { id: true },
      });

      if (!persisted) {
        throw new Error(
          `Pull request #${created.number} conflicts with an existing row; issue left unshipped`,
        );
      }

      await tx.issue.update({
        where: { id: issue.id },
        data: { status: "PR_OPENED" },
      });
    });

    await this.audit?.recordSystem({
      tenantId: job.tenantId,
      action: "issue.pr.opened",
      targetType: "issue",
      targetId: issue.id,
      metadata: {
        runId: run.id,
        url: created.url,
        number: created.number,
        headBranch: created.headBranch,
        baseBranch: created.baseBranch,
        title: patch.commitMessage,
      },
    });

    this.logger.log(`opened ${created.url} for issue ${issue.id}`);
  }

  /**
   * Ship step: creates the Jira ticket for a READY report (or re-flips the
   * status when the ticket already exists). Idempotent; queue retries apply.
   */
  async handleCreateTicket(job: TicketJob): Promise<void> {
    const issue = await this.prisma.withTenant(job.tenantId, (tx) =>
      tx.issue.findFirst({
        where: { id: job.issueId, tenantId: job.tenantId },
        include: {
          ticket: { select: { id: true } },
          signals: {
            orderBy: { occurredAt: "desc" },
            take: 10,
            select: { provider: true, title: true, url: true },
          },
          runs: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              rootCause: true,
              pullRequest: { select: { url: true } },
            },
          },
        },
      }),
    );

    if (!issue) {
      this.logger.warn(`ticket skipped: issue ${job.issueId} not found`);
      return;
    }

    if (issue.ticket) {
      await this.flipToTicketed(job.tenantId, issue.id, issue.status);
      return;
    }

    if (!["READY", "TICKETED", "PR_OPENED"].includes(issue.status)) {
      this.logger.warn(`ticket skipped: issue ${issue.id} is ${issue.status}`);
      return;
    }

    const created = await this.jira.createIssue({
      tenantId: job.tenantId,
      summary: issue.title,
      description: buildTicketDescription({
        summary: issue.summary,
        signals: issue.signals,
        rootCause: issue.runs[0]?.rootCause ?? null,
        pullRequestUrl: issue.runs[0]?.pullRequest?.url ?? null,
      }),
    });

    await this.prisma.withTenant(job.tenantId, async (tx) => {
      await tx.ticket.createMany({
        data: [
          {
            tenantId: job.tenantId,
            issueId: issue.id,
            key: created.key,
            url: created.url,
            projectKey: created.projectKey,
            issueType: created.issueType,
            summary: issue.title,
          },
        ],
        skipDuplicates: true,
      });

      // skipDuplicates can swallow a (tenantId, key) conflict — never flip
      // the issue without a persisted row.
      const persisted = await tx.ticket.findUnique({
        where: { issueId: issue.id },
        select: { id: true },
      });

      if (!persisted) {
        throw new Error(
          `Ticket ${created.key} conflicts with an existing row; issue left unticketed`,
        );
      }

      if (issue.status === "READY") {
        await tx.issue.update({
          where: { id: issue.id },
          data: { status: "TICKETED" },
        });
      }
    });

    await this.audit?.recordSystem({
      tenantId: job.tenantId,
      action: "issue.ticket.created",
      targetType: "issue",
      targetId: issue.id,
      metadata: {
        key: created.key,
        url: created.url,
        projectKey: created.projectKey,
        issueType: created.issueType,
        summary: issue.title,
      },
    });

    this.logger.log(`created ticket ${created.key} for issue ${issue.id}`);
  }

  private async flipToTicketed(
    tenantId: string,
    issueId: string,
    status: string,
  ): Promise<void> {
    if (status !== "READY" && status !== "TICKETED") {
      return;
    }

    await this.prisma.withTenant(tenantId, async (tx) => {
      await tx.issue.update({
        where: { id: issueId },
        data: { status: "TICKETED" },
      });
    });
  }

  private async markShipped(tenantId: string, issueId: string): Promise<void> {
    await this.prisma.withTenant(tenantId, async (tx) => {
      await tx.issue.update({
        where: { id: issueId },
        data: { status: "PR_OPENED" },
      });
    });
  }

  private async applyDecision(
    run: RunRow,
    stage: RunStatus,
    result: StageResult,
    options: StageOptions = {},
  ): Promise<void> {
    const decision = decideAfterStage(toRunState(run), stage, result, options);

    this.logger.log(
      `run ${run.id} ${stage} -> ${decision.next} (attempt ${decision.attempt}${decision.reason ? `, ${decision.reason}` : ""})`,
    );

    await this.prisma.withTenant(run.tenantId, async (tx) => {
      await tx.run.update({
        where: { id: run.id },
        data: {
          status: decision.next,
          attempt: decision.attempt,
          replans: decision.replans,
          ...(result === "retryable" || result === "needs_replan"
            ? { lastError: options.reason ?? null }
            : {}),
          ...(result === "passed" ? { lastError: null } : {}),
          ...(decision.next === "SUCCEEDED" ||
          decision.next === "FAILED" ||
          decision.next === "ESCALATED"
            ? { finishedAt: new Date() }
            : {}),
        },
      });

      if (decision.next === "ESCALATED") {
        await tx.issue.update({
          where: { id: run.issueId },
          data: { status: "ESCALATED" },
        });
      } else if (decision.next === "FAILED") {
        await tx.issue.update({
          where: { id: run.issueId },
          data: { status: "FAILED" },
        });
      } else if (decision.next === "SUCCEEDED") {
        // Compute done: the issue awaits a human (or rule) to ship it
        // (design.md principle 3 — writes are a separate, confirmed step).
        await tx.issue.update({
          where: { id: run.issueId },
          data: { status: "READY" },
        });
      }
    });

    this.metrics?.recordRunTransition(decision.next);

    if (decision.next === "ESCALATED") {
      await this.audit?.recordSystem({
        tenantId: run.tenantId,
        action: "run.escalated",
        targetType: "run",
        targetId: run.id,
        metadata: {
          issueId: run.issueId,
          stage,
          reason: decision.reason ?? options.reason ?? null,
          attempt: decision.attempt,
        },
      });
    }

    await this.publishStage(
      run.tenantId,
      run.id,
      decision.next,
      decision.attempt,
    );

    if (decision.next === "SUCCEEDED") {
      await this.applyAutomation(run.tenantId, run.issueId, run.confidence);
    }
  }

  /**
   * Automation rules (design.md §8.5) run once a report is ready: they may
   * create the ticket and/or open the PR, subject to the confidence floor and
   * the daily PR limit baked into the rule.
   */
  private async applyAutomation(
    tenantId: string,
    issueId: string,
    confidence: number | null,
  ): Promise<void> {
    const issue = await this.prisma.withTenant(tenantId, (tx) =>
      tx.issue.findFirst({
        where: { id: issueId, tenantId },
        select: {
          id: true,
          title: true,
          signalCount: true,
          repositoryId: true,
          ticket: { select: { id: true } },
        },
      }),
    );

    if (!issue) {
      return;
    }

    const rule = await this.ruleEngine.evaluateAutomation(tenantId, {
      title: issue.title,
      signalCount: issue.signalCount,
    });

    if (!rule) {
      return;
    }

    this.logger.log(`automation rule ${rule.ruleId} matched issue ${issueId}`);

    await this.audit?.recordSystem({
      tenantId,
      action: "rule.automation.matched",
      targetType: "issue",
      targetId: issueId,
      metadata: {
        ruleId: rule.ruleId,
        actions: {
          createTicket: Boolean(rule.actions.createTicket),
          openPr: Boolean(rule.actions.openPr),
          repositoryId: rule.actions.repositoryId ?? null,
        },
      },
    });

    // The rule's target repository applies to the report when it has none.
    if (rule.actions.repositoryId && !issue.repositoryId) {
      await this.prisma.withTenant(tenantId, async (tx) => {
        await tx.issue.update({
          where: { id: issueId },
          data: { repositoryId: rule.actions.repositoryId! },
        });
      });
    }

    if (rule.actions.createTicket && !issue.ticket) {
      await this.publisher.publish(
        "ticket",
        { tenantId, issueId },
        { jobId: `ticket-${issueId}-create` },
      );
    }

    if (rule.actions.openPr) {
      const minConfidence = rule.actions.minConfidence ?? 0.7;

      if ((confidence ?? 0) < minConfidence) {
        this.logger.log(
          `pr skipped for issue ${issueId}: confidence ${confidence ?? 0} below ${minConfidence}`,
        );
        return;
      }

      const limit = rule.actions.dailyPrLimit ?? 5;
      const createdToday = await this.prisma.withTenant(tenantId, (tx) =>
        tx.pullRequest.count({
          where: { tenantId, createdAt: { gte: startOfUtcDay() } },
        }),
      );

      if (createdToday >= limit) {
        this.logger.warn(
          `pr skipped for issue ${issueId}: daily PR limit ${limit} reached`,
        );
        return;
      }

      await this.publisher.publish(
        "pr",
        { tenantId, issueId },
        { jobId: `ship-${issueId}-pr` },
      );
    }
  }

  private mapFailure(failure: AgentFailure): StageResult {
    switch (failure.kind) {
      case "terminal":
        return "failed";
      case "needs_replan":
        return "needs_replan";
      case "retryable":
        return "retryable";
    }
  }

  /**
   * Mint a short-lived checkout token when the issue has a linked repository.
   * Never logs the token. Returns null if App/installation is missing.
   */
  private async resolveCheckout(
    tenantId: string,
    context: IssueContext,
  ): Promise<RepositoryCheckout | null> {
    if (!context.repository) {
      return null;
    }

    const token = await this.githubTokens.mintInstallationToken(tenantId);
    if (!token) {
      return null;
    }

    return {
      fullName: context.repository.fullName,
      ref: context.repository.defaultBranch,
      token,
    };
  }

  private async publishStage(
    tenantId: string,
    runId: string,
    status: RunStatus,
    attempt: number,
  ): Promise<void> {
    const queue = QUEUE_FOR_STATUS[status];

    if (!queue) {
      return;
    }

    await this.publisher.publish(
      queue,
      { tenantId, runId },
      { jobId: `run-${runId}-${queue}-${attempt}` },
    );
  }

  private async loadRun(
    tenantId: string,
    runId: string,
  ): Promise<RunRow | null> {
    return this.prisma.withTenant(tenantId, async (tx) =>
      tx.run.findUnique({
        where: { id: runId },
        select: {
          id: true,
          tenantId: true,
          issueId: true,
          status: true,
          attempt: true,
          replans: true,
          maxAttempts: true,
          lastError: true,
          confidence: true,
        },
      }),
    );
  }

  private async latestPlan(tenantId: string, runId: string) {
    const row = await this.prisma.withTenant(tenantId, async (tx) =>
      tx.plan.findFirst({
        where: { runId },
        orderBy: { attempt: "desc" },
        select: {
          rootCause: true,
          filesToInspect: true,
          changeStrategy: true,
          testsToRun: true,
          confidence: true,
          needsMoreContext: true,
          missingContext: true,
        },
      }),
    );

    if (!row) {
      return null;
    }

    return {
      rootCause: row.rootCause,
      filesToInspect: row.filesToInspect,
      changeStrategy: row.changeStrategy,
      testsToRun: row.testsToRun,
      confidence: row.confidence,
      needsMoreContext: row.needsMoreContext,
      missingContext: row.missingContext,
    };
  }

  private async latestPatch(tenantId: string, runId: string) {
    const row = await this.prisma.withTenant(tenantId, async (tx) =>
      tx.patch.findFirst({
        where: { runId },
        orderBy: { attempt: "desc" },
        include: { fileChanges: true },
      }),
    );

    if (!row) {
      return null;
    }

    return {
      changes: row.fileChanges.map((change) => ({
        path: change.path,
        oldContent: change.oldContent,
        newContent: change.newContent,
      })),
      commitMessage: row.commitMessage,
      testsToRun: row.testsToRun,
      rationale: row.rationale,
    };
  }
}

function toRunState(run: {
  status: RunStatus;
  attempt: number;
  maxAttempts: number;
  replans: number;
}): RunState {
  return {
    status: run.status,
    attempt: run.attempt,
    maxAttempts: run.maxAttempts,
    replans: run.replans,
  };
}

function startOfUtcDay(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

const TICKET_DESCRIPTION_BYTES = 30_000;

function buildTicketDescription(input: {
  summary: string;
  signals: { provider: string; title: string; url: string | null }[];
  rootCause: string | null;
  pullRequestUrl: string | null;
}): string {
  const lines = [input.summary, "", "Signals:"];

  for (const signal of input.signals) {
    lines.push(
      `- ${signal.provider}: ${signal.title}${signal.url ? ` (${signal.url})` : ""}`,
    );
  }

  if (input.rootCause) {
    lines.push("", "Root cause:", input.rootCause);
  }

  if (input.pullRequestUrl) {
    lines.push("", `Pull request: ${input.pullRequestUrl}`);
  }

  lines.push("", "_Created by CodeBeast._");

  return truncateToBytes(lines.join("\n"), TICKET_DESCRIPTION_BYTES);
}
