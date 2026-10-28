import Link from "next/link";

import { ErrorBanner } from "@/components/shell/page-header";
import { ProviderChip } from "@/components/sources/provider-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { apiFetch } from "@/lib/api";
import type {
  IssueDetailView,
  Paginated,
  RunDetailView,
  RunView,
} from "@/lib/api-types";
import { fullTimestamp, relativeTime } from "@/lib/format";
import { PROVIDER_LABELS } from "@/lib/providers";
import { pullRequestChip, reportChip, validationChip } from "@/lib/status";

import {
  approveAction,
  createBothAction,
  createTicketAction,
  ignoreAction,
  retryAction,
  shipPrAction,
} from "../actions";

function ActionButton({
  action,
  issueId,
  label,
  variant = "secondary",
}: {
  action: (formData: FormData) => Promise<void>;
  issueId: string;
  label: string;
  variant?: "primary" | "secondary" | "ghost";
}) {
  return (
    <form action={action}>
      <input type="hidden" name="issueId" value={issueId} />
      <Button type="submit" variant={variant} size="sm">
        {label}
      </Button>
    </form>
  );
}

function confidenceLabel(confidence: number | null): string {
  if (confidence === null) {
    return "Confidence unknown";
  }

  return confidence >= 0.7
    ? "High confidence"
    : "Low confidence, review carefully";
}

export default async function IssueDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : undefined;

  const issue = await apiFetch<IssueDetailView>(`/issues/${id}`);
  const runList = await apiFetch<Paginated<RunView>>(
    `/runs?issueId=${id}&limit=1`,
  );
  const latest = runList.data[0] ?? null;
  const run = latest
    ? await apiFetch<RunDetailView>(`/runs/${latest.id}`)
    : null;

  const chip = reportChip(issue.status, run?.pullRequest);
  const patch = run?.patches.at(-1) ?? null;
  const validation = run?.validations.at(-1) ?? null;
  const plan = run?.plans.at(-1) ?? null;

  const canTicket =
    !issue.ticket && ["READY", "TICKETED", "PR_OPENED"].includes(issue.status);
  const canShip =
    !run?.pullRequest && ["READY", "TICKETED"].includes(issue.status);
  const canRetry = ["FAILED", "ESCALATED", "IGNORED"].includes(issue.status);
  const canApprove = issue.status === "PR_OPENED";
  const canIgnore = !["RESOLVED", "IGNORED"].includes(issue.status);

  const primary: "approve" | "both" | "ship" | "ticket" | null = canApprove
    ? "approve"
    : canShip && canTicket
      ? "both"
      : canShip
        ? "ship"
        : canTicket
          ? "ticket"
          : null;

  return (
    <>
      <Link
        href="/issues"
        className="text-[13px] text-foreground-subtle hover:text-foreground"
      >
        ← Reports
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl leading-8 font-semibold tracking-[-0.02em]">
            {issue.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-foreground-subtle">
            <Badge tone={chip.tone} dot>
              {chip.label}
            </Badge>
            {issue.repository ? (
              <span className="font-mono">{issue.repository.fullName}</span>
            ) : null}
            <span title={fullTimestamp(issue.firstSeenAt)}>
              found {relativeTime(issue.firstSeenAt)}
            </span>
            <span>· {issue.signalCount} signal(s)</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canRetry ? (
            <ActionButton
              action={retryAction}
              issueId={issue.id}
              label="Retry"
            />
          ) : null}
          {canIgnore ? (
            <ActionButton
              action={ignoreAction}
              issueId={issue.id}
              label="Ignore"
              variant="ghost"
            />
          ) : null}
          {primary === "approve" ? (
            <ActionButton
              action={approveAction}
              issueId={issue.id}
              label="Approve & resolve"
              variant="primary"
            />
          ) : null}
          {primary === "ticket" ? (
            <ActionButton
              action={createTicketAction}
              issueId={issue.id}
              label="Create ticket"
              variant="primary"
            />
          ) : null}
          {primary === "ship" ? (
            <ActionButton
              action={shipPrAction}
              issueId={issue.id}
              label="Open PR"
              variant="primary"
            />
          ) : null}
          {primary === "both" ? (
            <ActionButton
              action={createBothAction}
              issueId={issue.id}
              label="Create ticket and open PR"
              variant="primary"
            />
          ) : null}
          {primary !== "ticket" && canTicket ? (
            <ActionButton
              action={createTicketAction}
              issueId={issue.id}
              label="Create ticket"
            />
          ) : null}
          {primary !== "ship" && canShip ? (
            <ActionButton
              action={shipPrAction}
              issueId={issue.id}
              label="Open PR"
            />
          ) : null}
        </div>
      </div>

      <div className="mt-6">
        <ErrorBanner message={error} />

        <div className="grid gap-6 lg:grid-cols-[7fr_5fr]">
          <Card>
            <CardHeader
              title="Evidence"
              description="Everything the AI concluded is traceable to a signal."
            />
            <CardBody className="space-y-5">
              <p className="max-w-[75ch] text-sm leading-6 text-foreground-muted">
                {issue.summary}
              </p>

              <div>
                <h3 className="mb-2 text-sm font-medium">
                  Signals ({issue.signals.length})
                </h3>
                <ul className="divide-y divide-border">
                  {issue.signals.map((signal) => (
                    <li key={signal.id} className="flex items-start gap-3 py-3">
                      <ProviderChip provider={signal.provider} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {signal.title}
                        </p>
                        <p className="mt-0.5 text-xs text-foreground-subtle">
                          {PROVIDER_LABELS[signal.provider]}
                          {signal.actor ? ` · ${signal.actor}` : ""} ·{" "}
                          <span title={fullTimestamp(signal.occurredAt)}>
                            {relativeTime(signal.occurredAt)}
                          </span>
                        </p>
                      </div>
                      {signal.url ? (
                        <a
                          href={signal.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[13px] text-accent hover:underline"
                        >
                          Open in {PROVIDER_LABELS[signal.provider]}
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>

              {plan ? (
                <div>
                  <h3 className="text-sm font-medium">Possible cause</h3>
                  <p className="mt-1 max-w-[75ch] text-sm leading-6 text-foreground-muted">
                    {plan.rootCause}
                  </p>
                  <p className="mt-1 text-xs text-foreground-subtle">
                    {confidenceLabel(plan.confidence)} · files:{" "}
                    <span className="font-mono">
                      {plan.filesToInspect.join(", ")}
                    </span>
                  </p>
                </div>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Generated output"
              description="Writes happen only when you confirm."
            />
            <CardBody>
              <Tabs
                tabs={[
                  {
                    id: "ticket",
                    label: "Jira ticket",
                    content: issue.ticket ? (
                      <div className="space-y-3 text-sm">
                        <p className="flex items-center gap-2">
                          <a
                            href={issue.ticket.url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-accent hover:underline"
                          >
                            {issue.ticket.key}
                          </a>
                          <Badge tone="info" dot>
                            Created
                          </Badge>
                        </p>
                        <p className="text-foreground-muted">
                          {issue.ticket.projectKey} · {issue.ticket.issueType} ·{" "}
                          {issue.ticket.summary}
                        </p>
                        <p className="text-xs text-foreground-subtle">
                          Created {relativeTime(issue.ticket.createdAt)}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-sm text-foreground-muted">
                          {canTicket
                            ? "No ticket yet. CodeBeast will create it with the evidence above attached."
                            : "No ticket for this report."}
                        </p>
                        {canTicket ? (
                          <form action={createTicketAction}>
                            <input
                              type="hidden"
                              name="issueId"
                              value={issue.id}
                            />
                            <Button type="submit" size="sm">
                              Create ticket
                            </Button>
                          </form>
                        ) : null}
                      </div>
                    ),
                  },
                  {
                    id: "pr",
                    label: "GitHub PR",
                    content: run?.pullRequest ? (
                      <div className="space-y-3 text-sm">
                        <p className="flex items-center gap-2">
                          <a
                            href={run.pullRequest.url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-accent hover:underline"
                          >
                            #{run.pullRequest.number}
                          </a>
                          <Badge
                            tone={pullRequestChip(run.pullRequest.status).tone}
                          >
                            {pullRequestChip(run.pullRequest.status).label}
                          </Badge>
                        </p>
                        <p className="text-foreground-muted">
                          {run.pullRequest.title}
                        </p>
                        <p className="font-mono text-xs text-foreground-subtle">
                          {run.pullRequest.headBranch} →{" "}
                          {run.pullRequest.baseBranch}
                        </p>
                      </div>
                    ) : patch ? (
                      <div className="space-y-3">
                        <p className="text-sm text-foreground-muted">
                          Patch ready: {patch.commitMessage}
                        </p>
                        <ul className="space-y-1">
                          {patch.fileChanges.map((change) => (
                            <li
                              key={change.path}
                              className="font-mono text-xs text-foreground-muted"
                            >
                              {change.path}
                            </li>
                          ))}
                        </ul>
                        {validation ? (
                          <Badge tone={validationChip(validation.status).tone}>
                            {validationChip(validation.status).label}
                          </Badge>
                        ) : null}
                        {canShip ? (
                          <form action={shipPrAction}>
                            <input
                              type="hidden"
                              name="issueId"
                              value={issue.id}
                            />
                            <Button type="submit" size="sm">
                              Open PR
                            </Button>
                          </form>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-sm text-foreground-muted">
                        No patch yet — the run has not produced one.
                      </p>
                    ),
                  },
                ]}
              />
            </CardBody>
          </Card>
        </div>

        {run ? (
          <Card className="mt-6">
            <CardHeader
              title="Run"
              description={`Attempt ${run.attempt} · ${run.replans} replan(s)`}
              action={
                <Badge
                  tone={
                    run.status === "SUCCEEDED"
                      ? "success"
                      : run.status === "FAILED" || run.status === "ESCALATED"
                        ? "danger"
                        : "info"
                  }
                  dot
                >
                  {run.status}
                </Badge>
              }
            />
            <CardBody className="space-y-4">
              {run.lastError ? (
                <p className="rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-[13px] text-warning-fg">
                  {run.lastError}
                </p>
              ) : null}

              {patch ? (
                <div>
                  <h3 className="text-sm font-medium">{patch.commitMessage}</h3>
                  <p className="mt-1 max-w-[75ch] text-sm text-foreground-muted">
                    {patch.rationale}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {patch.fileChanges.map((change) => (
                      <li key={change.path} className="text-xs">
                        <span className="font-mono text-foreground-muted">
                          {change.path}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {validation?.output ? (
                <details className="rounded-md border border-border bg-surface-muted">
                  <summary className="cursor-pointer px-3 py-2 text-[13px] text-foreground-muted">
                    Validator output
                  </summary>
                  <pre className="overflow-x-auto px-3 pb-3 font-mono text-xs text-foreground-muted">
                    {validation.output}
                  </pre>
                </details>
              ) : null}
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}
