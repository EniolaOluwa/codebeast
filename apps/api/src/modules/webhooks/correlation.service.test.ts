import type { ConfigService } from "@nestjs/config";
import { type NormalizedSignal, normalizedSignalSchema } from "@repo/types";
import { describe, expect, it, vi } from "vitest";

import { CryptoService } from "../../common/crypto/crypto.service.ts";
import { CorrelationService } from "./correlation.service.ts";

const crypto = new CryptoService({
  getOrThrow: (): string => "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
} as unknown as ConfigService);

function makeSignal(
  overrides: Partial<NormalizedSignal> = {},
): NormalizedSignal {
  return normalizedSignalSchema.parse({
    provider: "SENTRY",
    externalId: "42",
    eventType: "issue.created",
    title: "TypeError in export",
    body: "at handleExport (src/export.ts:47:11)",
    url: "https://sentry.io/issues/42",
    actor: null,
    occurredAt: "2026-10-23T10:00:00.000Z",
    correlationKey: "sentry:issue:42",
    repositoryHint: null,
    ...overrides,
  });
}

function makeHarness() {
  const tx = {
    issue: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    issueSignal: { createMany: vi.fn(), findUnique: vi.fn() },
    repository: { findFirst: vi.fn() },
  };

  return { service: new CorrelationService(crypto), tx };
}

describe("CorrelationService", () => {
  it("attaches a signal to a recent issue with the same key", async () => {
    const { service, tx } = makeHarness();

    tx.issue.findFirst.mockResolvedValue({ id: "issue_1" });
    tx.issueSignal.createMany.mockResolvedValue({ count: 1 });
    tx.issueSignal.findUnique.mockResolvedValue({ id: "signal_1" });

    const result = await service.correlate(
      tx as never,
      "tenant_1",
      makeSignal(),
    );

    expect(result).toEqual({
      issueId: "issue_1",
      signalId: "signal_1",
      issueCreated: false,
      signalAttached: true,
    });
    expect(tx.issue.update).toHaveBeenCalledWith({
      where: { id: "issue_1" },
      data: {
        lastSeenAt: expect.any(Date),
        signalCount: { increment: 1 },
        snapshot: {},
      },
    });
  });

  it("creates an issue and links the hinted repository", async () => {
    const { service, tx } = makeHarness();

    tx.issue.findFirst.mockResolvedValue(null);
    tx.repository.findFirst.mockResolvedValue({ id: "repo_1" });
    tx.issue.create.mockResolvedValue({ id: "issue_2" });
    tx.issueSignal.createMany.mockResolvedValue({ count: 1 });
    tx.issueSignal.findUnique.mockResolvedValue({ id: "signal_2" });

    const result = await service.correlate(
      tx as never,
      "tenant_1",
      makeSignal({
        provider: "GITHUB",
        repositoryHint: "acme/web",
        correlationKey: "github:acme/web:issue:12",
      }),
    );

    const createArg = tx.issue.create.mock.calls[0]![0].data;
    expect(createArg).toMatchObject({
      tenantId: "tenant_1",
      repositoryId: "repo_1",
      correlationKey: "github:acme/web:issue:12",
    });
    expect(result.issueCreated).toBe(true);
    expect(result.issueId).toBe("issue_2");
  });

  it("treats a replayed delivery as already attached and skips counters", async () => {
    const { service, tx } = makeHarness();

    tx.issue.findFirst.mockResolvedValue({ id: "issue_1" });
    tx.issueSignal.createMany.mockResolvedValue({ count: 0 });
    tx.issueSignal.findUnique.mockResolvedValue({ id: "signal_prev" });

    const result = await service.correlate(
      tx as never,
      "tenant_1",
      makeSignal(),
    );

    expect(result).toMatchObject({
      issueId: "issue_1",
      signalId: "signal_prev",
      signalAttached: false,
    });
    expect(tx.issue.update).not.toHaveBeenCalled();
  });
});
