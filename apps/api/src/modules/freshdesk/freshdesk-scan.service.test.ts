import type { NormalizedSignal } from "@repo/types";
import { describe, expect, it, vi } from "vitest";

import { FreshdeskScanService } from "./freshdesk-scan.service.ts";

function makeHarness(
  options: {
    integration?: Record<string, unknown> | null;
    tickets?: Record<string, unknown>[];
  } = {},
) {
  const integration =
    options.integration === undefined
      ? {
          id: "integration_1",
          enabled: true,
          config: { domain: "acme.freshdesk.com" },
        }
      : options.integration;

  const tx = {
    integration: {
      findFirst: vi.fn().mockResolvedValue(integration),
      update: vi.fn(),
    },
  };

  const prisma = {
    withTenant: vi.fn(
      async (_tenantId: string, fn: (txArg: unknown) => unknown) => fn(tx),
    ),
  };

  const freshdesk = {
    fetchTickets: vi.fn().mockResolvedValue(
      options.tickets ?? [
        {
          id: 8841,
          subject: "Export fails",
          description_text: "Customer reports a 500.",
          requester: { email: "dana@customer.example" },
          created_at: "2026-10-22T08:00:00.000Z",
        },
      ],
    ),
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

  return {
    service: new FreshdeskScanService(
      prisma as never,
      freshdesk as never,
      ingest as never,
    ),
    tx,
    freshdesk,
    ingest,
  };
}

describe("FreshdeskScanService", () => {
  it("imports scanned conversations with the domain-derived URL", async () => {
    const { service, ingest, tx } = makeHarness();

    const result = await service.run({
      tenantId: "tenant_1",
      integrationId: "integration_1",
    });

    expect(result).toEqual({ scanned: 1, imported: 1 });
    expect(ingest.ingest.mock.calls[0]![1][0]).toMatchObject({
      provider: "FRESHDESK",
      externalId: "8841",
      url: "https://acme.freshdesk.com/a/tickets/8841",
      correlationKey: "freshdesk:ticket:8841",
    });
    expect(tx.integration.update.mock.calls[0]![0].data.config).toMatchObject({
      lastScanFound: 1,
      domain: "acme.freshdesk.com",
    });
  });

  it("skips integrations without a domain, disabled or missing", async () => {
    const noDomain = makeHarness({
      integration: { id: "i1", enabled: true, config: {} },
    });
    await expect(
      noDomain.service.run({ tenantId: "t", integrationId: "i1" }),
    ).resolves.toEqual({ scanned: 0, imported: 0 });
    expect(noDomain.freshdesk.fetchTickets).not.toHaveBeenCalled();

    const missing = makeHarness({ integration: null });
    await expect(
      missing.service.run({ tenantId: "t", integrationId: "nope" }),
    ).resolves.toEqual({ scanned: 0, imported: 0 });
  });
});
