import { SettingsNav } from "@/components/settings/settings-nav";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import type { Me } from "@/lib/api-types";

export default async function SettingsPage() {
  const me = await apiFetch<Me>("/auth/me");

  return (
    <>
      <PageHeader title="Settings" />
      <SettingsNav />

      <div className="mt-6 grid max-w-[560px] gap-6">
        <Card>
          <CardHeader
            title="Workspace"
            description="The tenant every source, report and run belongs to."
          />
          <CardBody className="space-y-2 text-sm">
            <p className="flex justify-between gap-4">
              <span className="text-foreground-subtle">Tenant id</span>
              <span className="font-mono text-xs">{me.tenantId}</span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-foreground-subtle">Connected as</span>
              <span>{me.user.email}</span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-foreground-subtle">Your role</span>
              <span className="capitalize">{me.role.toLowerCase()}</span>
            </p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
