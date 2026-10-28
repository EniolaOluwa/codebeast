import { InviteMemberForm } from "@/components/settings/invite-member-form";
import { SettingsNav } from "@/components/settings/settings-nav";
import { ErrorBanner, PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import type { MemberView, Paginated } from "@/lib/api-types";
import { relativeTime } from "@/lib/format";

import {
  inviteMemberAction,
  removeMemberAction,
  updateMemberRoleAction,
} from "../actions";

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const members = await apiFetch<Paginated<MemberView>>("/members?limit=100");

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
            title="Members"
            description={`${members.pagination.total} account(s) in this workspace.`}
          />
          <CardBody className="pt-0">
            <ul className="divide-y divide-border">
              {members.data.map((member) => (
                <li
                  key={member.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {member.name ?? member.email}
                    </p>
                    <p className="text-xs text-foreground-subtle">
                      {member.email} · joined {relativeTime(member.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <form
                      action={updateMemberRoleAction}
                      className="flex items-center gap-2"
                    >
                      <input type="hidden" name="memberId" value={member.id} />
                      <select
                        name="role"
                        defaultValue={member.role}
                        aria-label={`Role for ${member.email}`}
                        className="h-8 rounded-md border border-border-strong bg-background px-2 text-[13px]"
                      >
                        <option value="OWNER">Owner</option>
                        <option value="ADMIN">Admin</option>
                        <option value="MEMBER">Member</option>
                      </select>
                      <Button type="submit" variant="secondary" size="sm">
                        Save
                      </Button>
                    </form>
                    <Badge tone="neutral">{member.role.toLowerCase()}</Badge>
                    <form action={removeMemberAction}>
                      <input type="hidden" name="memberId" value={member.id} />
                      <Button type="submit" variant="ghost" size="sm">
                        Remove
                      </Button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Add a member" />
          <CardBody>
            <InviteMemberForm action={inviteMemberAction} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
