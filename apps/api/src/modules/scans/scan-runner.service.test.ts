import { describe, expect, it, vi } from "vitest";

import { ScanRunner } from "./scan-runner.service.ts";

function makeHarness(integrationType: string | null) {
  const prisma = {
    withTenant: vi.fn(async (_tenantId: string, fn: (tx: unknown) => unknown) =>
      fn({
        integration: {
          findFirst: async () =>
            integrationType ? { type: integrationType } : null,
        },
      }),
    ),
  };

  const jira = {
    type: "JIRA",
    run: vi.fn().mockResolvedValue({ scanned: 1, imported: 1 }),
  };
  const discord = {
    type: "DISCORD",
    run: vi.fn().mockResolvedValue({ scanned: 2, imported: 2 }),
  };

  const runner = new ScanRunner(prisma as never, [
    jira as never,
    discord as never,
  ]);

  return { runner, jira, discord };
}

describe("ScanRunner", () => {
  it("dispatches to the scanner matching the integration type", async () => {
    const { runner, discord, jira } = makeHarness("DISCORD");

    const result = await runner.run({
      tenantId: "tenant_1",
      integrationId: "integration_1",
    });

    expect(result).toEqual({ scanned: 2, imported: 2 });
    expect(discord.run).toHaveBeenCalledOnce();
    expect(jira.run).not.toHaveBeenCalled();
  });

  it("no-ops for missing integrations or unregistered types", async () => {
    const missing = makeHarness(null);
    await expect(
      missing.runner.run({ tenantId: "t", integrationId: "nope" }),
    ).resolves.toEqual({ scanned: 0, imported: 0 });

    const unscannable = makeHarness("SLACK");
    await expect(
      unscannable.runner.run({ tenantId: "t", integrationId: "i1" }),
    ).resolves.toEqual({ scanned: 0, imported: 0 });
    expect(unscannable.jira.run).not.toHaveBeenCalled();
    expect(unscannable.discord.run).not.toHaveBeenCalled();
  });
});
