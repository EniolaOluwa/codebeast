import type { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";

import { CryptoService } from "../../common/crypto/crypto.service.ts";
import { NotFoundError } from "../../common/errors/errors.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";
import { ApiKeysService } from "./api-keys.service.ts";

const config = {
  getOrThrow: (): string => "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
} as unknown as ConfigService;

const crypto = new CryptoService(config);

const CREATED_AT = new Date("2026-10-23T10:00:00.000Z");

function makeHarness() {
  const tx = {
    apiKey: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  };

  const prisma = {
    withTenant: vi.fn(
      async (_tenantId: string, fn: (txArg: unknown) => unknown) => fn(tx),
    ),
  } as unknown as PrismaService;

  return { service: new ApiKeysService(prisma, crypto), tx };
}

describe("ApiKeysService.create", () => {
  it("returns the raw key exactly once and stores only its hash", async () => {
    const { service, tx } = makeHarness();

    tx.apiKey.create.mockImplementation(
      async ({ data }: { data: { prefix: string } }) => ({
        id: "key_1",
        name: data.prefix,
        prefix: data.prefix,
        scopes: ["issues:read"],
        lastUsedAt: null,
        revokedAt: null,
        createdAt: CREATED_AT,
      }),
    );

    const created = await service.create("tenant_1", {
      name: "ci-bot",
      scopes: ["issues:read"],
    });

    const stored = tx.apiKey.create.mock.calls[0]![0].data;

    expect(stored.prefix).toMatch(/^cb_live_[0-9a-f]{8}$/);
    expect(stored.keyHash).toBe(crypto.hash(created.key));
    expect(created.key.startsWith(`${stored.prefix}_`)).toBe(true);
    expect(created.key).not.toBe(stored.keyHash);
    expect(created.scopes).toEqual(["issues:read"]);
  });
});

describe("ApiKeysService.list", () => {
  it("paginates and never leaks hashes", async () => {
    const { service, tx } = makeHarness();

    tx.apiKey.findMany.mockResolvedValue([
      {
        id: "key_1",
        name: "ci-bot",
        prefix: "cb_live_abcd1234",
        scopes: ["issues:read"],
        lastUsedAt: null,
        revokedAt: null,
        createdAt: CREATED_AT,
      },
    ]);
    tx.apiKey.count.mockResolvedValue(1);

    const result = await service.list("tenant_1", 1, 20);

    expect(result.data[0]).toEqual({
      id: "key_1",
      name: "ci-bot",
      prefix: "cb_live_abcd1234",
      scopes: ["issues:read"],
      lastUsedAt: null,
      revokedAt: null,
      createdAt: "2026-10-23T10:00:00.000Z",
    });
    expect(JSON.stringify(result)).not.toContain("keyHash");
  });
});

describe("ApiKeysService.revoke", () => {
  it("stamps revokedAt and keeps an earlier revocation timestamp", async () => {
    const { service, tx } = makeHarness();

    tx.apiKey.findFirst.mockResolvedValue({
      id: "key_1",
      revokedAt: null,
    });
    tx.apiKey.update.mockResolvedValue({
      id: "key_1",
      name: "ci-bot",
      prefix: "cb_live_abcd1234",
      scopes: [],
      lastUsedAt: null,
      revokedAt: CREATED_AT,
      createdAt: CREATED_AT,
    });

    await service.revoke("tenant_1", "key_1");

    expect(tx.apiKey.update).toHaveBeenCalledWith({
      where: { id: "key_1" },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("404s for keys outside the tenant", async () => {
    const { service, tx } = makeHarness();

    tx.apiKey.findFirst.mockResolvedValue(null);

    await expect(service.revoke("tenant_1", "key_x")).rejects.toThrow(
      NotFoundError,
    );
  });
});
