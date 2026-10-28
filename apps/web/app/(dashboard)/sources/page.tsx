import {
  EmptyState,
  ErrorBanner,
  PageHeader,
} from "@/components/shell/page-header";
import { ConnectSourceForm } from "@/components/sources/connect-source-form";
import { ProviderChip } from "@/components/sources/provider-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import type { IntegrationView, Paginated } from "@/lib/api-types";
import { relativeTime } from "@/lib/format";
import {
  PROVIDER_LABELS,
  SCANNABLE_TYPES,
  SOURCE_TYPES,
} from "@/lib/providers";

import { connectSourceAction, scanSourceAction } from "./actions";

function lastScanAt(integration: IntegrationView): string | null {
  const value = (integration.config as Record<string, unknown>)?.lastScanAt;

  return typeof value === "string" ? value : null;
}

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;

  const integrations = await apiFetch<Paginated<IntegrationView>>(
    "/integrations?limit=100",
  );

  const availableTypes = SOURCE_TYPES.filter(
    (type) => !integrations.data.some((item) => item.type === type),
  );

  return (
    <>
      <PageHeader
        title="Sources"
        description="Connect what CodeBeast should watch, and scan existing items."
      />

      <ErrorBanner message={error} />

      <section>
        <h2 className="mb-3 text-lg font-semibold tracking-[-0.01em]">
          Connected
        </h2>
        {integrations.data.length === 0 ? (
          <EmptyState title="No sources connected yet. Connect Sentry or Slack to start finding bug reports." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {integrations.data.map((integration) => (
              <Card key={integration.id}>
                <CardBody className="space-y-3 pt-5">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <ProviderChip provider={integration.type} />
                      <span className="text-sm font-medium">
                        {PROVIDER_LABELS[integration.type]}
                      </span>
                    </span>
                    <Badge
                      tone={integration.enabled ? "success" : "danger"}
                      dot
                    >
                      {integration.enabled ? "Connected" : "Disabled"}
                    </Badge>
                  </div>
                  <div className="text-[13px] text-foreground-subtle">
                    <p className="truncate">{integration.name}</p>
                    <p>
                      {integration.externalId
                        ? `id ${integration.externalId}`
                        : "no external id"}
                    </p>
                    {SCANNABLE_TYPES.includes(integration.type) ? (
                      <p>
                        {lastScanAt(integration)
                          ? `last scan ${relativeTime(lastScanAt(integration)!)}`
                          : "never scanned"}
                      </p>
                    ) : null}
                  </div>
                  {SCANNABLE_TYPES.includes(integration.type) ? (
                    <form action={scanSourceAction}>
                      <input
                        type="hidden"
                        name="integrationId"
                        value={integration.id}
                      />
                      <Button type="submit" variant="secondary" size="sm">
                        Scan now
                      </Button>
                    </form>
                  ) : null}
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </section>

      {availableTypes.length > 0 ? (
        <section className="mt-10 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div>
            <h2 className="mb-3 text-lg font-semibold tracking-[-0.01em]">
              Available
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {availableTypes.map((type) => (
                <Card key={type}>
                  <CardBody className="space-y-1 pt-5">
                    <span className="flex items-center gap-2">
                      <ProviderChip provider={type} />
                      <span className="text-sm font-medium">
                        {PROVIDER_LABELS[type]}
                      </span>
                    </span>
                    <p className="text-[13px] text-foreground-subtle">
                      {type === "SENTRY"
                        ? "Watch error issues and turn them into reports."
                        : type === "SLACK"
                          ? "Watch support channels and customer reports."
                          : type === "DISCORD"
                            ? "Scan server channels for customer reports."
                            : type === "FRESHDESK"
                              ? "Import conversations and receive new ones."
                              : type === "JIRA"
                                ? "Create tickets and import existing items."
                                : "Open pull requests for validated fixes."}
                    </p>
                  </CardBody>
                </Card>
              ))}
            </div>
          </div>

          <Card>
            <CardHeader title="Connect a source" />
            <CardBody>
              <ConnectSourceForm action={connectSourceAction} />
            </CardBody>
          </Card>
        </section>
      ) : null}
    </>
  );
}
