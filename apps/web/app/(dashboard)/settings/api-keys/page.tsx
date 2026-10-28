import { ApiKeyForm } from "@/components/settings/api-key-form";
import { SettingsNav } from "@/components/settings/settings-nav";
import { ErrorBanner, PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import type { ApiKeyView, Paginated } from "@/lib/api-types";
import { relativeTime } from "@/lib/format";

import { createApiKeyAction, revokeApiKeyAction } from "../actions";

export default async function ApiKeysPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const keys = await apiFetch<Paginated<ApiKeyView>>("/api-keys?limit=100");

  return (
    <>
      <PageHeader title="Settings" />
      <SettingsNav />
      <div className="mt-4">
        <ErrorBanner
          message={typeof params.error === "string" ? params.error : undefined}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader
            title="API keys"
            description="Machine credentials for the ingest API. Raw keys are shown once."
          />
          <CardBody className="pt-0">
            {keys.data.length === 0 ? (
              <p className="py-3 text-sm text-foreground-muted">No keys yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {keys.data.map((key) => (
                  <li
                    key={key.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{key.name}</p>
                      <p className="font-mono text-xs text-foreground-subtle">
                        {key.prefix}…
                      </p>
                      <p className="mt-0.5 text-xs text-foreground-subtle">
                        {key.lastUsedAt
                          ? `last used ${relativeTime(key.lastUsedAt)}`
                          : "never used"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={key.revokedAt ? "danger" : "success"} dot>
                        {key.revokedAt ? "Revoked" : "Active"}
                      </Badge>
                      {!key.revokedAt ? (
                        <form action={revokeApiKeyAction}>
                          <input type="hidden" name="keyId" value={key.id} />
                          <Button type="submit" variant="ghost" size="sm">
                            Revoke
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Create a key" />
          <CardBody>
            <ApiKeyForm action={createApiKeyAction} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
