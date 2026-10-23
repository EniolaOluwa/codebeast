import Link from "next/link";

import {
  EmptyState,
  ErrorBanner,
  PageHeader,
} from "@/components/shell/page-header";
import { ProviderChips } from "@/components/sources/provider-chip";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import type { IssueView, Paginated } from "@/lib/api-types";
import { relativeTime } from "@/lib/format";
import { ISSUE_STATUS_FILTERS } from "@/lib/providers";
import { reportChip } from "@/lib/status";

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = typeof params.status === "string" ? params.status : "";
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const error = typeof params.error === "string" ? params.error : undefined;

  const query = new URLSearchParams({
    page: String(page),
    limit: "20",
    ...(status ? { status } : {}),
  });
  const issues = await apiFetch<Paginated<IssueView>>(
    `/issues?${query.toString()}`,
  );

  const pageLink = (target: number) => {
    const next = new URLSearchParams({
      page: String(target),
      ...(status ? { status } : {}),
    });

    return `/issues?${next.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Reports"
        description="Bug reports found automatically, waiting to be shipped."
        actions={
          <form method="get" className="flex items-center gap-2">
            <select
              name="status"
              defaultValue={status}
              aria-label="Filter by status"
              className="h-9 rounded-md border border-border-strong bg-background px-2 text-sm"
            >
              {ISSUE_STATUS_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button type="submit" className={buttonClass("secondary", "md")}>
              Filter
            </button>
          </form>
        }
      />

      <ErrorBanner message={error} />

      {issues.data.length === 0 ? (
        <EmptyState
          title={
            status
              ? "No reports match this filter."
              : "No reports need review. New ones appear here as they are found."
          }
          action={
            !status ? (
              <Link
                href="/sources"
                className="text-[13px] text-accent hover:underline"
              >
                Connect a source
              </Link>
            ) : undefined
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-surface-muted text-xs text-foreground-subtle">
                <tr className="border-b border-border">
                  <th className="px-4 py-2.5 font-medium">Report</th>
                  <th className="px-3 py-2.5 font-medium">Sources</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Ticket</th>
                  <th className="px-4 py-2.5 text-right font-medium">Found</th>
                </tr>
              </thead>
              <tbody>
                {issues.data.map((issue) => {
                  const chip = reportChip(issue.status);

                  return (
                    <tr
                      key={issue.id}
                      className="border-b border-border last:border-0 hover:bg-surface-hover"
                    >
                      <td className="max-w-md px-4 py-0">
                        <Link
                          href={`/issues/${issue.id}`}
                          className="block truncate py-2.5 text-sm font-medium"
                        >
                          {issue.title}
                        </Link>
                      </td>
                      <td className="px-3">
                        <ProviderChips providers={issue.providers} />
                      </td>
                      <td className="px-3">
                        <Badge tone={chip.tone}>{chip.label}</Badge>
                      </td>
                      <td className="px-3">
                        {issue.ticket ? (
                          <a
                            href={issue.ticket.url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-xs text-accent hover:underline"
                          >
                            {issue.ticket.key}
                          </a>
                        ) : (
                          <span className="text-foreground-subtle">—</span>
                        )}
                      </td>
                      <td className="px-4 text-right text-foreground-subtle">
                        {relativeTime(issue.lastSeenAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-[13px] text-foreground-subtle">
            <span>
              {(issues.pagination.page - 1) * issues.pagination.limit + 1}–
              {Math.min(
                issues.pagination.page * issues.pagination.limit,
                issues.pagination.total,
              )}{" "}
              of {issues.pagination.total}
            </span>
            <span className="flex gap-2">
              {issues.pagination.page > 1 ? (
                <Link
                  href={pageLink(issues.pagination.page - 1)}
                  className={buttonClass("ghost", "sm")}
                >
                  Previous
                </Link>
              ) : null}
              {issues.pagination.page < issues.pagination.totalPages ? (
                <Link
                  href={pageLink(issues.pagination.page + 1)}
                  className={buttonClass("ghost", "sm")}
                >
                  Next
                </Link>
              ) : null}
            </span>
          </div>
        </Card>
      )}
    </>
  );
}
