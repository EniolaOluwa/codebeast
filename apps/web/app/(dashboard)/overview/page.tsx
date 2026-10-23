import Link from "next/link";

import { EmptyState, PageHeader } from "@/components/shell/page-header";
import { ProviderChip } from "@/components/sources/provider-chip";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import type { OverviewView } from "@/lib/api-types";
import { relativeTime } from "@/lib/format";
import { PROVIDER_LABELS } from "@/lib/providers";
import { reportChip } from "@/lib/status";

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <Card>
      <CardBody className="pt-5">
        <p className="text-sm text-foreground-muted">{label}</p>
        <p className="mt-1 text-[28px] leading-9 font-semibold tabular-nums">
          {value}
        </p>
        {hint ? (
          <p className="mt-0.5 text-xs text-foreground-subtle">{hint}</p>
        ) : null}
      </CardBody>
    </Card>
  );
}

export default async function OverviewPage() {
  const overview = await apiFetch<OverviewView>("/overview");

  return (
    <>
      <PageHeader
        title="Overview"
        description={`Pipeline health for the last ${overview.windowDays} days.`}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Reports found"
          value={overview.reportsFound}
          hint="New reports in this window"
        />
        <StatCard
          label="Tickets created"
          value={overview.ticketsCreated}
          hint="Shipped to Jira"
        />
        <StatCard
          label="PRs opened"
          value={overview.prsOpened}
          hint={`${overview.prsMerged} merged`}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Needs review"
            description="Reports waiting for a human"
            action={
              <Link
                href="/issues?status=READY"
                className="text-[13px] text-accent hover:underline"
              >
                View all
              </Link>
            }
          />
          <CardBody className="pt-0">
            {overview.needsReview.length === 0 ? (
              <EmptyState title="No reports need review. New ones appear here as they are found." />
            ) : (
              <ul className="divide-y divide-border">
                {overview.needsReview.map((issue) => (
                  <li key={issue.id}>
                    <Link
                      href={`/issues/${issue.id}`}
                      className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 hover:bg-surface-hover"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="flex items-center gap-1">
                          {issue.providers.map((provider) => (
                            <ProviderChip key={provider} provider={provider} />
                          ))}
                        </span>
                        <span className="truncate text-sm font-medium">
                          {issue.title}
                        </span>
                      </span>
                      <Badge tone={reportChip(issue.status).tone}>
                        {reportChip(issue.status).label}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Source health"
            description="Connections and their last signal"
          />
          <CardBody className="pt-0">
            {overview.sources.length === 0 ? (
              <EmptyState
                title="No sources connected yet. Connect Sentry or Slack to start finding bug reports."
                action={
                  <Link
                    href="/sources"
                    className="text-[13px] text-accent hover:underline"
                  >
                    Connect a source
                  </Link>
                }
              />
            ) : (
              <ul className="divide-y divide-border">
                {overview.sources.map((source) => (
                  <li
                    key={source.integrationId}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <span className="flex items-center gap-2">
                      <ProviderChip provider={source.type} />
                      <span className="text-sm font-medium">
                        {PROVIDER_LABELS[source.type]}
                        <span className="ml-2 text-[13px] font-normal text-foreground-subtle">
                          {source.name}
                        </span>
                      </span>
                    </span>
                    <span className="text-[13px] text-foreground-subtle">
                      {source.lastSeenAt
                        ? `last seen ${relativeTime(source.lastSeenAt)}`
                        : "no signals yet"}
                    </span>
                    <Badge tone={source.healthy ? "success" : "danger"} dot>
                      {source.healthy ? "Healthy" : "Reconnect"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
