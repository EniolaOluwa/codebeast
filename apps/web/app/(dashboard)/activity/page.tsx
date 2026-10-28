import Link from "next/link";

import {
  EmptyState,
  ErrorBanner,
  PageHeader,
} from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import type { AuditLogView, Paginated } from "@/lib/api-types";
import { relativeTime } from "@/lib/format";

const ACTOR_FILTERS = [
  { value: "", label: "All actors" },
  { value: "USER", label: "Users" },
  { value: "API_KEY", label: "API keys" },
  { value: "SYSTEM", label: "Automation" },
] as const;

function actorLabel(row: AuditLogView): string {
  if (row.actorType === "SYSTEM") {
    return "Automation";
  }
  if (row.actorType === "API_KEY") {
    return row.actorId ? `API key ${row.actorId.slice(0, 8)}` : "API key";
  }
  return row.actorId ? `User ${row.actorId.slice(0, 8)}` : "User";
}

function resultLabel(row: AuditLogView): string {
  if (row.action.includes("fail") || row.action.includes("escalat")) {
    return "Failed";
  }
  if (row.action.includes("ignore")) {
    return "Ignored";
  }
  return "OK";
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const actorType =
    typeof params.actorType === "string" ? params.actorType : "";
  const action = typeof params.action === "string" ? params.action : "";
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const error = typeof params.error === "string" ? params.error : undefined;

  const query = new URLSearchParams({
    page: String(page),
    limit: "20",
    ...(actorType ? { actorType } : {}),
    ...(action ? { action } : {}),
  });

  let logs: Paginated<AuditLogView>;
  try {
    logs = await apiFetch<Paginated<AuditLogView>>(
      `/audit-logs?${query.toString()}`,
    );
  } catch (err) {
    return (
      <>
        <PageHeader
          title="Activity"
          description="Audit log of every action taken (human or automated)."
        />
        <ErrorBanner
          message={
            err instanceof Error ? err.message : "Failed to load activity"
          }
        />
      </>
    );
  }

  const pageLink = (target: number) => {
    const next = new URLSearchParams({
      page: String(target),
      ...(actorType ? { actorType } : {}),
      ...(action ? { action } : {}),
    });
    return `/activity?${next.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Activity"
        description="Chronological audit log of every action taken (human or automated)."
        actions={
          <form method="get" className="flex flex-wrap items-center gap-2">
            <select
              name="actorType"
              defaultValue={actorType}
              aria-label="Filter by actor"
              className="h-9 rounded-md border border-border-strong bg-background px-2 text-sm"
            >
              {ACTOR_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              name="action"
              defaultValue={action}
              placeholder="Action prefix"
              aria-label="Filter by action"
              className="h-9 w-40 rounded-md border border-border-strong bg-background px-2 text-sm"
            />
            <button type="submit" className={buttonClass("secondary", "md")}>
              Filter
            </button>
          </form>
        }
      />

      <ErrorBanner message={error} />

      {logs.data.length === 0 ? (
        <EmptyState
          title={
            actorType || action
              ? "No activity matches this filter."
              : "No activity yet. Actions appear here as your workspace is used."
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-surface-muted text-xs text-foreground-subtle">
                <tr className="border-b border-border">
                  <th className="px-4 py-2.5 font-medium">Time</th>
                  <th className="px-3 py-2.5 font-medium">Actor</th>
                  <th className="px-3 py-2.5 font-medium">Action</th>
                  <th className="px-3 py-2.5 font-medium">Target</th>
                  <th className="px-3 py-2.5 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {logs.data.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-4 py-3 align-top text-foreground-muted whitespace-nowrap">
                      <time dateTime={row.createdAt} title={row.createdAt}>
                        {relativeTime(row.createdAt)}
                      </time>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <Badge tone="neutral">{actorLabel(row)}</Badge>
                    </td>
                    <td className="px-3 py-3 align-top font-medium">
                      <details>
                        <summary className="cursor-pointer list-none">
                          {row.action}
                        </summary>
                        <pre className="mt-2 max-w-xl overflow-x-auto rounded-md bg-surface-muted p-2 text-[11px] text-foreground-muted">
                          {JSON.stringify(row.metadata ?? {}, null, 2)}
                        </pre>
                      </details>
                    </td>
                    <td className="px-3 py-3 align-top text-foreground-muted">
                      {row.targetType}
                      {row.targetId ? (
                        <span className="ml-1 font-mono text-[11px]">
                          {row.targetId.slice(0, 10)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <Badge
                        tone={
                          resultLabel(row) === "Failed" ? "danger" : "success"
                        }
                      >
                        {resultLabel(row)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {logs.pagination.totalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-[13px]">
              <span className="text-foreground-muted">
                Page {logs.pagination.page} of {logs.pagination.totalPages}
              </span>
              <div className="flex gap-2">
                {page > 1 ? (
                  <Link
                    href={pageLink(page - 1)}
                    className={buttonClass("ghost", "sm")}
                  >
                    Previous
                  </Link>
                ) : null}
                {page < logs.pagination.totalPages ? (
                  <Link
                    href={pageLink(page + 1)}
                    className={buttonClass("ghost", "sm")}
                  >
                    Next
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </Card>
      )}
    </>
  );
}
