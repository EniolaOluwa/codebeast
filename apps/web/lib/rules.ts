import type { AutomationActions, Rule, RuleConditions } from "@repo/types";

import { PROVIDER_LABELS } from "./providers";

/** design.md §8.5: every rule reads as one plain-language sentence. */

export function describeConditions(conditions: RuleConditions): string {
  const subject = conditions.providers?.length
    ? `a ${conditions.providers.map((provider) => PROVIDER_LABELS[provider]).join(" or ")} report`
    : "any report";

  const clauses: string[] = [];

  if (
    conditions.minSignalCount !== undefined &&
    conditions.minSignalCount > 1
  ) {
    clauses.push(`has at least ${conditions.minSignalCount} signals`);
  }

  if (conditions.titleContains) {
    clauses.push(`title contains "${conditions.titleContains}"`);
  }

  return clauses.length > 0
    ? `${subject} that ${clauses.join(" and ")}`
    : subject;
}

export function describeRule(
  rule: Rule,
  options: { repositoryName?: string } = {},
): string {
  const when = describeConditions(rule.conditions);

  if (rule.kind === "DETECTION") {
    const actions = rule.actions as { action: "DETECT" | "IGNORE" };

    return actions.action === "IGNORE"
      ? `When ${when} is found, record it as ignored.`
      : `When ${when} is found, keep it as a report.`;
  }

  const actions = rule.actions as AutomationActions;
  const parts: string[] = [];

  if (actions.createTicket) {
    parts.push("create a Jira ticket");
  }

  if (actions.openPr) {
    const repository = options.repositoryName
      ? ` in ${options.repositoryName}`
      : "";
    const confidence =
      actions.minConfidence !== undefined
        ? `, min confidence ${Math.round(actions.minConfidence * 100)}%`
        : "";
    const limit =
      actions.dailyPrLimit !== undefined
        ? `, max ${actions.dailyPrLimit}/day`
        : "";

    parts.push(`open a PR ready for review${repository}${confidence}${limit}`);
  }

  return `When ${when} is ready, ${parts.join(" and ")}.`;
}
