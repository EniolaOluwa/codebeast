import { Injectable, Logger } from "@nestjs/common";
import {
  type AutomationActions,
  automationActionsSchema,
  detectionActionsSchema,
  type Provider,
  type RuleConditions,
  ruleConditionsSchema,
  type RuleDryRun,
} from "@repo/types";

import { NotFoundError } from "../../common/errors/errors.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";

export interface RuleSubject {
  providers: Provider[];
  signalCount: number;
  title: string;
}

export interface DetectionDecision {
  action: "DETECT" | "IGNORE";
  ruleId?: string;
}

export interface AutomationDecision {
  ruleId: string;
  actions: AutomationActions;
}

const DRY_RUN_WINDOW_DAYS = 7;
const DRY_RUN_SAMPLE_SIZE = 5;

/**
 * The rules engine (design.md §8.5). Pure condition matching plus ordered
 * evaluation: enabled rules run oldest-first, first match wins. No matching
 * detection rule means "detect" (current behaviour is the default).
 */
@Injectable()
export class RuleEngine {
  private readonly logger = new Logger(RuleEngine.name);

  constructor(private readonly prisma: PrismaService) {}

  matches(conditions: RuleConditions, subject: RuleSubject): boolean {
    if (
      conditions.providers &&
      !conditions.providers.some((provider) =>
        subject.providers.includes(provider),
      )
    ) {
      return false;
    }

    if (
      conditions.minSignalCount !== undefined &&
      subject.signalCount < conditions.minSignalCount
    ) {
      return false;
    }

    if (
      conditions.titleContains &&
      !subject.title
        .toLowerCase()
        .includes(conditions.titleContains.toLowerCase())
    ) {
      return false;
    }

    return true;
  }

  async evaluateDetection(
    tenantId: string,
    subject: RuleSubject,
  ): Promise<DetectionDecision> {
    const rules = await this.loadEnabled(tenantId, "DETECTION");

    for (const rule of rules) {
      const conditions = ruleConditionsSchema.safeParse(rule.conditions);

      if (!conditions.success) {
        this.logger.warn(`rule ${rule.id} has invalid conditions; skipped`);
        continue;
      }

      if (!this.matches(conditions.data, subject)) {
        continue;
      }

      const actions = detectionActionsSchema.safeParse(rule.actions);

      if (!actions.success) {
        this.logger.warn(`rule ${rule.id} has invalid actions; skipped`);
        continue;
      }

      return { action: actions.data.action, ruleId: rule.id };
    }

    return { action: "DETECT" };
  }

  async evaluateAutomation(
    tenantId: string,
    subject: Omit<RuleSubject, "providers">,
  ): Promise<AutomationDecision | null> {
    const rules = await this.loadEnabled(tenantId, "AUTOMATION");

    for (const rule of rules) {
      const conditions = ruleConditionsSchema.safeParse(rule.conditions);

      if (!conditions.success) {
        this.logger.warn(`rule ${rule.id} has invalid conditions; skipped`);
        continue;
      }

      if (!this.matches(conditions.data, { ...subject, providers: [] })) {
        continue;
      }

      const actions = automationActionsSchema.safeParse(rule.actions);

      if (!actions.success) {
        this.logger.warn(`rule ${rule.id} has invalid actions; skipped`);
        continue;
      }

      return { ruleId: rule.id, actions: actions.data };
    }

    return null;
  }

  /** design.md §8.5: "Test this rule against the last 7 days". */
  async dryRun(tenantId: string, ruleId: string): Promise<RuleDryRun> {
    const rule = await this.prisma.withTenant(tenantId, (tx) =>
      tx.rule.findFirst({
        where: { id: ruleId, tenantId },
        select: { id: true, conditions: true },
      }),
    );

    if (!rule) {
      throw new NotFoundError("Rule");
    }

    const conditions = ruleConditionsSchema.parse(rule.conditions);
    const since = new Date(Date.now() - DRY_RUN_WINDOW_DAYS * 86_400_000);

    const issues = await this.prisma.withTenant(tenantId, (tx) =>
      tx.issue.findMany({
        where: { tenantId, createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        include: { signals: { select: { provider: true }, take: 3 } },
      }),
    );

    const matched = issues.filter((issue) =>
      this.matches(conditions, {
        providers: [...new Set(issue.signals.map((signal) => signal.provider))],
        signalCount: issue.signalCount,
        title: issue.title,
      }),
    );

    return {
      ruleId,
      windowDays: DRY_RUN_WINDOW_DAYS,
      matched: matched.length,
      sample: matched.slice(0, DRY_RUN_SAMPLE_SIZE).map((issue) => ({
        id: issue.id,
        title: issue.title,
        status: issue.status,
      })),
    };
  }

  private async loadEnabled(
    tenantId: string,
    kind: "DETECTION" | "AUTOMATION",
  ): Promise<{ id: string; conditions: unknown; actions: unknown }[]> {
    return this.prisma.withTenant(tenantId, (tx) =>
      tx.rule.findMany({
        where: { tenantId, kind, enabled: true },
        orderBy: { createdAt: "asc" },
        select: { id: true, conditions: true, actions: true },
      }),
    );
  }
}
