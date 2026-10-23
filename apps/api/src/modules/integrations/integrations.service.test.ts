import type { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";

import { CryptoService } from "../../common/crypto/crypto.service.ts";
import { ConflictError, NotFoundError } from "../../common/errors/errors.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";
import { IntegrationsService } from "./integrations.service.ts";

const crypto = new CryptoService({
  getOrThrow: (): string => "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
} as unknown as ConfigService);

const NOW = new Date("2026-10-23T10:00:00.000Z");

function makeHarness() {
  const tx = {
    integration: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };

  const prisma = {
    withTenant: vi.fn(
      async (_tenantId: string, fn: (txArg: unknown) => unknown) => fn(tx),
    ),
  } as unknown as PrismaService;

  const publisher = { publish: vi.fn(async (): Promise<void> => undefined) };

  return {
    service: new IntegrationsService(prisma, crypto, publisher as never),
    tx,
    publisher,
  };
}

function rowFromCreateData(data: Record<string, unknown>) {
  return {
    id: "integration_1",
    type: "SLACK",
    name: "support",
    externalId: null,
    config: {},
    enabled: true,
    repositoryId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...data,
  };
}

describe("IntegrationsService", () => {
  it("encrypts secrets at rest and never echoes them", async () => {
    const { service, tx } = makeHarness();

    tx.integration.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) =>
        rowFromCreateData(data),
    );

    const integration = await service.create("tenant_1", {
      type: "SLACK",
      name: "support",
      secrets: { signingSecret: "whsec_123" },
    });

    const stored = tx.integration.create.mock.calls[0]![0].data
      .secrets as string;
    expect(stored).not.toContain("whsec_123");
    expect(service.getSecrets({ secrets: stored })).toEqual({
      signingSecret: "whsec_123",
    });
    expect(integration.hasSecrets).toBe(true);
    expect(JSON.stringify(integration)).not.toContain("whsec_123");
  });

  it("creates without secrets", async () => {
    const { service, tx } = makeHarness();

    tx.integration.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) =>
        rowFromCreateData(data),
    );

    const integration = await service.create("tenant_1", {
      type: "JIRA",
      name: "tickets",
    });

    expect(tx.integration.create.mock.calls[0]![0].data.secrets).toBeNull();
    expect(integration.hasSecrets).toBe(false);
  });

  it("maps duplicate name/external id to a conflict", async () => {
    const { service, tx } = makeHarness();

    tx.integration.create.mockRejectedValue({ code: "P2002" });

    await expect(
      service.create("tenant_1", { type: "SLACK", name: "support" }),
    ).rejects.toThrow(ConflictError);
  });

  it("re-encrypts on update and leaves secrets untouched when absent", async () => {
    const { service, tx } = makeHarness();

    tx.integration.findFirst.mockResolvedValue({ id: "integration_1" });
    tx.integration.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) =>
        rowFromCreateData(data),
    );

    await service.update("tenant_1", "integration_1", {
      secrets: { signingSecret: "new-secret" },
    });
    const updated = tx.integration.update.mock.calls[0]![0].data
      .secrets as string;
    expect(service.getSecrets({ secrets: updated })).toEqual({
      signingSecret: "new-secret",
    });

    await service.update("tenant_1", "integration_1", { name: "renamed" });
    expect("secrets" in tx.integration.update.mock.calls[1]![0].data).toBe(
      false,
    );
  });

  it("survives undecryptable or non-object secret bags", () => {
    const { service } = makeHarness();

    expect(service.getSecrets({ secrets: null })).toEqual({});
    expect(
      service.getSecrets({
        secrets: crypto.encrypt(JSON.stringify(["not", "an", "object"])),
      }),
    ).toEqual({});
    expect(() => service.getSecrets({ secrets: "v1.not.a.payload" })).toThrow();
  });

  it("404s for missing integrations", async () => {
    const { service, tx } = makeHarness();

    tx.integration.findFirst.mockResolvedValue(null);

    await expect(service.get("tenant_1", "nope")).rejects.toThrow(
      NotFoundError,
    );
    await expect(service.remove("tenant_1", "nope")).rejects.toThrow(
      NotFoundError,
    );
  });
});

describe("IntegrationsService.requestScan", () => {
  it("queues a scan for an enabled Jira source", async () => {
    const { service, tx, publisher } = makeHarness();

    tx.integration.findFirst.mockResolvedValue({
      id: "integration_1",
      type: "JIRA",
      enabled: true,
    });

    await expect(
      service.requestScan("tenant_1", "integration_1"),
    ).resolves.toEqual({ accepted: true });

    expect(publisher.publish).toHaveBeenCalledWith(
      "scan",
      { tenantId: "tenant_1", integrationId: "integration_1" },
      { jobId: "scan-integration_1" },
    );
  });

  it("rejects non-Jira sources and disabled integrations", async () => {
    const { service, tx } = makeHarness();

    tx.integration.findFirst.mockResolvedValue({
      id: "integration_1",
      type: "SLACK",
      enabled: true,
    });
    await expect(
      service.requestScan("tenant_1", "integration_1"),
    ).rejects.toThrow(/Only Jira sources/);

    tx.integration.findFirst.mockResolvedValue({
      id: "integration_1",
      type: "JIRA",
      enabled: false,
    });
    await expect(
      service.requestScan("tenant_1", "integration_1"),
    ).rejects.toThrow(/disabled/);
  });

  it("404s for missing integrations", async () => {
    const { service, tx } = makeHarness();

    tx.integration.findFirst.mockResolvedValue(null);

    await expect(service.requestScan("tenant_1", "nope")).rejects.toThrow(
      NotFoundError,
    );
  });
});
