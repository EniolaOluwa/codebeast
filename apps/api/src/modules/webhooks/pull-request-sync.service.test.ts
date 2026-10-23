import { describe, expect, it, vi } from "vitest";

import { PullRequestSyncService } from "./pull-request-sync.service.ts";

function makeService(repoId: string | null = "repo_1") {
  const updateMany = vi.fn().mockResolvedValue({ count: repoId ? 1 : 0 });
  const tx = {
    repository: {
      findFirst: vi.fn().mockResolvedValue(repoId ? { id: repoId } : null),
    },
    pullRequest: { updateMany },
  };

  const prisma = {
    withTenant: vi.fn(
      async (_tenantId: string, fn: (txArg: unknown) => unknown) => fn(tx),
    ),
  };

  return {
    service: new PullRequestSyncService(prisma as never),
    updateMany,
  };
}

function prPayload(
  action: string,
  merged: boolean | null = null,
): Record<string, unknown> {
  return {
    action,
    repository: { full_name: "acme/web", default_branch: "main" },
    pull_request: {
      number: 42,
      title: "Fix export",
      html_url: "https://github.com/acme/web/pull/42",
      merged,
    },
  };
}

describe("PullRequestSyncService", () => {
  it("marks merged PRs as MERGED", async () => {
    const { service, updateMany } = makeService();

    const result = await service.sync("tenant_1", prPayload("closed", true));

    expect(result).toEqual({ handled: true, updated: true });
    expect(updateMany).toHaveBeenCalledWith({
      where: { repositoryId: "repo_1", number: 42 },
      data: { status: "MERGED" },
    });
  });

  it("marks unmerged closes as CLOSED and reopened ones as OPEN", async () => {
    const { service, updateMany } = makeService();

    await service.sync("tenant_1", prPayload("closed", false));
    expect(updateMany.mock.calls.at(-1)![0].data).toEqual({ status: "CLOSED" });

    await service.sync("tenant_1", prPayload("reopened"));
    expect(updateMany.mock.calls.at(-1)![0].data).toEqual({ status: "OPEN" });
  });

  it("ignores non-lifecycle actions but still claims the event", async () => {
    const { service, updateMany } = makeService();

    const result = await service.sync("tenant_1", prPayload("synchronize"));

    expect(result).toEqual({ handled: true, updated: false });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("handles PRs from repositories we do not track", async () => {
    const { service, updateMany } = makeService(null);

    const result = await service.sync("tenant_1", prPayload("closed", true));

    expect(result).toEqual({ handled: true, updated: false });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("does not claim non-PR payloads", async () => {
    const { service } = makeService();

    const result = await service.sync("tenant_1", {
      action: "opened",
      issue: { number: 1 },
    });

    expect(result).toEqual({ handled: false, updated: false });
  });
});
