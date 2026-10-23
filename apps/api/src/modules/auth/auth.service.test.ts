import type { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";

import { hashPassword } from "../../common/auth/password.ts";
import { TokenService } from "../../common/auth/token.service.ts";
import { CryptoService } from "../../common/crypto/crypto.service.ts";
import {
  ConflictError,
  UnauthorizedError,
} from "../../common/errors/errors.ts";
import { PrismaService, RLS_CONTEXT } from "../../prisma/prisma.service.ts";
import { AuthService } from "./auth.service.ts";

const values: Record<string, unknown> = {
  ENCRYPTION_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
  JWT_SECRET: "s".repeat(32),
  AUTH_ACCESS_TTL_SECONDS: 900,
  AUTH_REFRESH_TTL_SECONDS: 1_209_600,
};

const config = {
  getOrThrow: (key: string): unknown => values[key],
} as unknown as ConfigService;

const crypto = new CryptoService(config);

const NOW = new Date("2026-10-23T10:00:00.000Z");

function makeHarness() {
  const tx = {
    user: { create: vi.fn() },
    tenant: { create: vi.fn() },
    membership: { create: vi.fn(), findFirst: vi.fn() },
    refreshToken: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },
  };

  const client = {
    user: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
  };

  const prisma = {
    client,
    withRls: vi.fn(async (_context: unknown, fn: (txArg: unknown) => unknown) =>
      fn(tx),
    ),
    withTenant: vi.fn(
      async (_tenantId: string, fn: (txArg: unknown) => unknown) => fn(tx),
    ),
  } as unknown as PrismaService;

  const service = new AuthService(prisma, crypto, new TokenService(config));

  return { service, prisma, tx, client };
}

describe("AuthService.register", () => {
  it("creates a user, tenant and OWNER membership under the tenant claim", async () => {
    const { service, prisma, tx, client } = makeHarness();

    client.user.findUnique.mockResolvedValue(null);
    tx.user.create.mockResolvedValue({
      id: "user_1",
      email: "a@example.com",
      name: null,
      passwordHash: "hashed",
      createdAt: NOW,
      updatedAt: NOW,
    });
    tx.tenant.create.mockImplementation(
      async ({ data }: { data: { id: string } }) => data,
    );
    tx.membership.create.mockResolvedValue({ id: "membership_1" });
    tx.refreshToken.create.mockResolvedValue({ id: "rt_1" });

    const tokens = await service.register({
      email: "a@example.com",
      password: "password123",
    });

    expect(tokens.tokenType).toBe("Bearer");
    expect(tokens.expiresIn).toBe(900);

    const tenantArg = tx.tenant.create.mock.calls[0]![0].data;
    expect(tenantArg.id).toBeTruthy();
    expect(tenantArg.slug).toMatch(/^a-s-team-[0-9a-f]{6}$/);

    expect(prisma.withRls).toHaveBeenCalledWith(
      { [RLS_CONTEXT.TENANT]: tenantArg.id },
      expect.any(Function),
    );

    const membershipArg = tx.membership.create.mock.calls[0]![0].data;
    expect(membershipArg).toMatchObject({
      tenantId: tenantArg.id,
      userId: "user_1",
      role: "OWNER",
    });

    const stored = tx.refreshToken.create.mock.calls[0]![0].data;
    expect(stored.tokenHash).toBe(crypto.hash(tokens.refreshToken));
    expect(stored.tokenHash).not.toBe(tokens.refreshToken);
  });

  it("rejects duplicate emails", async () => {
    const { service, client, tx } = makeHarness();

    client.user.findUnique.mockResolvedValue({ id: "user_1" });

    await expect(
      service.register({ email: "a@example.com", password: "password123" }),
    ).rejects.toThrow(ConflictError);
    expect(tx.user.create).not.toHaveBeenCalled();
  });
});

describe("AuthService.login", () => {
  it("issues tokens for valid credentials", async () => {
    const { service, prisma, tx, client } = makeHarness();

    client.user.findUnique.mockResolvedValue({
      id: "user_1",
      email: "a@example.com",
      name: "A",
      passwordHash: await hashPassword("password123"),
      createdAt: NOW,
      updatedAt: NOW,
    });
    tx.membership.findFirst.mockResolvedValue({
      tenantId: "tenant_1",
      role: "MEMBER",
    });
    tx.refreshToken.create.mockResolvedValue({ id: "rt_1" });

    const tokens = await service.login({
      email: "a@example.com",
      password: "password123",
    });

    expect(tokens.accessToken).toBeTruthy();
    expect(prisma.withRls).toHaveBeenCalledWith(
      { [RLS_CONTEXT.USER]: "user_1" },
      expect.any(Function),
    );
  });

  it("rejects wrong passwords and unknown users with the same error", async () => {
    const { service, client } = makeHarness();

    client.user.findUnique.mockResolvedValue({
      id: "user_1",
      email: "a@example.com",
      name: null,
      passwordHash: await hashPassword("password123"),
      createdAt: NOW,
      updatedAt: NOW,
    });

    await expect(
      service.login({ email: "a@example.com", password: "wrong" }),
    ).rejects.toThrow(UnauthorizedError);

    client.user.findUnique.mockResolvedValue(null);
    await expect(
      service.login({ email: "nobody@example.com", password: "whatever" }),
    ).rejects.toThrow(UnauthorizedError);
  });

  it("rejects users without any membership", async () => {
    const { service, tx, client } = makeHarness();

    client.user.findUnique.mockResolvedValue({
      id: "user_1",
      email: "a@example.com",
      name: null,
      passwordHash: await hashPassword("password123"),
      createdAt: NOW,
      updatedAt: NOW,
    });
    tx.membership.findFirst.mockResolvedValue(null);

    await expect(
      service.login({ email: "a@example.com", password: "password123" }),
    ).rejects.toThrow(/No tenant membership/);
  });
});

describe("AuthService.refresh", () => {
  it("rotates the token in place (old revoked, new created)", async () => {
    const { service, tx } = makeHarness();

    const raw = crypto.randomToken(32);

    tx.refreshToken.findUnique.mockResolvedValue({
      id: "rt_1",
      tenantId: "tenant_1",
      userId: "user_1",
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      replacedById: null,
      user: { id: "user_1" },
    });
    tx.refreshToken.create.mockResolvedValue({ id: "rt_2" });

    const tokens = await service.refresh({ refreshToken: raw });

    expect(tokens.refreshToken).not.toBe(raw);
    expect(tx.refreshToken.update).toHaveBeenCalledWith({
      where: { id: "rt_1" },
      data: { revokedAt: expect.any(Date), replacedById: "rt_2" },
    });
  });

  it("treats reuse of a revoked token as theft and revokes the family", async () => {
    const { service, tx } = makeHarness();

    tx.refreshToken.findUnique.mockResolvedValue({
      id: "rt_1",
      tenantId: "tenant_1",
      userId: "user_1",
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
      replacedById: "rt_2",
      user: {},
    });

    await expect(
      service.refresh({ refreshToken: crypto.randomToken(32) }),
    ).rejects.toThrow(/reuse/i);

    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: "user_1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("rejects expired tokens", async () => {
    const { service, tx } = makeHarness();

    tx.refreshToken.findUnique.mockResolvedValue({
      id: "rt_1",
      tenantId: "tenant_1",
      userId: "user_1",
      expiresAt: new Date(Date.now() - 1_000),
      revokedAt: null,
      replacedById: null,
      user: {},
    });

    await expect(
      service.refresh({ refreshToken: crypto.randomToken(32) }),
    ).rejects.toThrow(/expired/i);
  });

  it("rejects unknown tokens", async () => {
    const { service, tx } = makeHarness();

    tx.refreshToken.findUnique.mockResolvedValue(null);

    await expect(
      service.refresh({ refreshToken: crypto.randomToken(32) }),
    ).rejects.toThrow(UnauthorizedError);
  });
});

describe("AuthService.logout", () => {
  it("revokes a known token and is idempotent for unknown ones", async () => {
    const { service, tx } = makeHarness();

    tx.refreshToken.findUnique.mockResolvedValue({
      id: "rt_1",
      tenantId: "tenant_1",
      revokedAt: null,
    });

    await expect(
      service.logout({ refreshToken: crypto.randomToken(32) }),
    ).resolves.toEqual({ success: true });
    expect(tx.refreshToken.update).toHaveBeenCalledOnce();

    tx.refreshToken.findUnique.mockResolvedValue(null);
    await expect(
      service.logout({ refreshToken: crypto.randomToken(32) }),
    ).resolves.toEqual({ success: true });
    expect(tx.refreshToken.update).toHaveBeenCalledOnce();
  });
});

describe("AuthService.me", () => {
  it("returns the wire user with ISO timestamps", async () => {
    const { service, client } = makeHarness();

    client.user.findUniqueOrThrow.mockResolvedValue({
      id: "user_1",
      email: "a@example.com",
      name: "A",
      createdAt: NOW,
      updatedAt: NOW,
    });

    const me = await service.me({
      type: "user",
      userId: "user_1",
      tenantId: "tenant_1",
      email: "a@example.com",
      role: "OWNER",
    });

    expect(me.user.createdAt).toBe("2026-10-23T10:00:00.000Z");
    expect(me.tenantId).toBe("tenant_1");
    expect(me.role).toBe("OWNER");
  });
});
