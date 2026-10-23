import type { Repository, Rule } from "@repo/types";

import { AutomationRuleForm } from "@/components/rules/automation-rule-form";
import { DetectionRuleForm } from "@/components/rules/detection-rule-form";
import {
  EmptyState,
  ErrorBanner,
  PageHeader,
} from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import type { Paginated } from "@/lib/api-types";
import { describeRule } from "@/lib/rules";

import {
  createAutomationRuleAction,
  createDetectionRuleAction,
  deleteRuleAction,
  dryRunRuleAction,
  toggleRuleAction,
} from "./actions";

function RuleCard({
  rule,
  repositoryName,
  dryRunMatched,
}: {
  rule: Rule;
  repositoryName?: string;
  dryRunMatched: number | null;
}) {
  return (
    <Card>
      <CardHeader
        title={rule.name}
        action={
          <Badge tone={rule.enabled ? "success" : "neutral"} dot>
            {rule.enabled ? "Enabled" : "Disabled"}
          </Badge>
        }
      />
      <CardBody className="space-y-4 pt-0">
        <p className="text-sm leading-6 text-foreground-muted">
          {describeRule(rule, {
            ...(repositoryName ? { repositoryName } : {}),
          })}
        </p>

        {dryRunMatched !== null ? (
          <p className="rounded-md border border-info-border bg-info-bg px-3 py-2 text-[13px] text-info-fg">
            Would have matched {dryRunMatched} report(s) in the last 7 days.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <form action={toggleRuleAction}>
            <input type="hidden" name="ruleId" value={rule.id} />
            <input
              type="hidden"
              name="enabled"
              value={rule.enabled ? "false" : "true"}
            />
            <Button
              type="submit"
              variant={rule.enabled ? "secondary" : "primary"}
              size="sm"
            >
              {rule.enabled ? "Disable" : "Enable"}
            </Button>
          </form>
          <form action={dryRunRuleAction}>
            <input type="hidden" name="ruleId" value={rule.id} />
            <Button type="submit" variant="secondary" size="sm">
              Test against the last 7 days
            </Button>
          </form>
          <form action={deleteRuleAction}>
            <input type="hidden" name="ruleId" value={rule.id} />
            <Button type="submit" variant="ghost" size="sm">
              Delete
            </Button>
          </form>
        </div>
      </CardBody>
    </Card>
  );
}

export default async function RulesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;
  const ranRuleId = typeof params.ran === "string" ? params.ran : undefined;
  const matched =
    typeof params.matched === "string" ? Number(params.matched) : null;

  const [rules, repositories] = await Promise.all([
    apiFetch<Rule[]>("/rules"),
    apiFetch<Paginated<Repository>>("/repositories?limit=100"),
  ]);

  const repositoryNames = new Map(
    repositories.data.map((repository) => [repository.id, repository.fullName]),
  );
  const detection = rules.filter((rule) => rule.kind === "DETECTION");
  const automation = rules.filter((rule) => rule.kind === "AUTOMATION");

  const cardProps = (rule: Rule) => {
    const repositoryId = (rule.actions as { repositoryId?: string })
      .repositoryId;

    return {
      rule,
      dryRunMatched: ranRuleId === rule.id ? matched : null,
      ...(repositoryId && repositoryNames.has(repositoryId)
        ? { repositoryName: repositoryNames.get(repositoryId)! }
        : {}),
    };
  };

  return (
    <>
      <PageHeader
        title="Rules"
        description="What becomes a report, and what ships automatically."
      />

      <ErrorBanner message={error} />

      <section>
        <h2 className="mb-3 text-lg font-semibold tracking-[-0.01em]">
          Detection
        </h2>
        {detection.length === 0 ? (
          <EmptyState title="No rules yet. Rules decide which signals become reports." />
        ) : (
          <div className="grid gap-4">
            {detection.map((rule) => (
              <RuleCard key={rule.id} {...cardProps(rule)} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold tracking-[-0.01em]">
          Automation
        </h2>
        {automation.length === 0 ? (
          <EmptyState title="No automation yet. Rules can create tickets and open PRs once a report is ready." />
        ) : (
          <div className="grid gap-4">
            {automation.map((rule) => (
              <RuleCard key={rule.id} {...cardProps(rule)} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="New detection rule"
            description="Rules are created disabled; enabling is a separate step."
          />
          <CardBody>
            <DetectionRuleForm action={createDetectionRuleAction} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="New automation rule"
            description="Auto-creation is opt-in; PR rules carry their own safety rails."
          />
          <CardBody>
            <AutomationRuleForm
              action={createAutomationRuleAction}
              repositories={repositories.data.map((repository) => ({
                id: repository.id,
                fullName: repository.fullName,
              }))}
            />
          </CardBody>
        </Card>
      </section>
    </>
  );
}
