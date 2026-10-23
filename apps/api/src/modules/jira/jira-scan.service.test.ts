import type { NormalizedSignal } from "@repo/types";
import { describe, expect, it, vi } from "vitest";

import { JiraScanService } from "./jira-scan.service.ts";

function makeHarness(
  options: {
    integration?: Record<string, unknown> | null;
  } = {},
) {
  const integration =
    options.integration === undefined
      ? {
          id: "integration_1",
          enabled: true,
          config: { siteUrl: "https://acme.atlassian.net", projectKey: "ENG" },
        }
      : options.integration;

  const tx = {
    integration: {
      findFirst: vi.fn().mockResolvedValue(integration),
      update: vi.fn().mockResolvedValue({}),
    },
  };

  const prisma = {
    withTenant: vi.fn(
      async (_tenantId: string, fn: (txArg: unknown) => unknown) => fn(tx),
    ),
  };

  const jira = {
    scan: vi.fn().mockResolvedValue([
      {
        key: "ENG-1",
        summary: "Old bug from Jira",
        description: "Steps to reproduce",
        url: "https://acme.atlassian.net/browse/ENG-1",
        created: "2026-10-01T10:00:00.000Z",
      },
    ]),
    createIssue: vi.fn(),
  };

  const ingest = {
    ingest: vi.fn(async (_tenantId: string, signals: NormalizedSignal[]) =>
      signals.map(() => ({
        issueId: "issue_1",
        signalId: "signal_1",
        issueCreated: true,
        signalAttached: true,
      })),
    ),
  };

  const service = new JiraScanService(
    prisma as never,
    jira as never,
    ingest as never,
  );

  return { service, tx, jira, ingest };
}

describe("JiraScanService", () => {
  it("imports scanned items through the shared signal ingest service", async () => {
    const { service, tx, ingest } = makeHarness();

    const result = await service.run({
      tenantId: "tenant_1",
      integrationId: "integration_1",
    });

    expect(result).toEqual({ scanned: 1, imported: 1 });

    const signals = ingest.ingest.mock.calls[0]![1];
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      provider: "JIRA",
      externalId: "ENG-1",
      eventType: "jira.scan",
      title: "Old bug from Jira",
      url: "https://acme.atlassian.net/browse/ENG-1",
      correlationKey: "jira:issue:ENG-1",
      occurredAt: "2026-10-01T10:00:00.000Z",
    });
    expect(signals[0]!.body).toContain("Steps to reproduce");
    expect(signals[0]!.body).toContain(
      "https://acme.atlassian.net/browse/ENG-1",
    );

    const update = tx.integration.update.mock.calls[0]![0].data.config;
    expect(update).toMatchObject({
      lastScanFound: 1,
      lastScanAt: expect.any(String),
      projectKey: "ENG",
    });
  });

  it("skips disabled or missing integrations without calling Jira", async () => {
    const disabled = makeHarness({
      integration: { id: "integration_1", enabled: false, config: {} },
    });

    await expect(
      disabled.service.run({
        tenantId: "tenant_1",
        integrationId: "integration_1",
      }),
    ).resolves.toEqual({ scanned: 0, imported: 0 });
    expect(disabled.jira.scan).not.toHaveBeenCalled();

    const missing = makeHarness({ integration: null });

    await expect(
      missing.service.run({
        tenantId: "tenant_1",
        integrationId: "nope",
      }),
    ).resolves.toEqual({ scanned: 0, imported: 0 });
    expect(missing.jira.scan).not.toHaveBeenCalled();
  });
});
