import { describe, expect, it, vi } from "vitest";

import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../common/errors/errors.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";
import { MembersService } from "./members.service.ts";

const CREATED_AT = new Date("2026-10-23T10:00:00.000Z");

function memberRow(
  overrides: {
    id?: string;
    userId?: string;
    role?: "OWNER" | "ADMIN" | "MEMBER";
  } = {},
) {
  return {
    id: overrides.id ?? "membership_1",
    userId: overrides.userId ?? "user_1",
    role: overrides.role ?? "MEMBER",
    createdAt: CREATED_AT,
    user: { email: "user@example.com", name: "User" },
  };
}

function makeHarness() {
  const tx = {
    membership: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
  };

  const client = { user: { findUnique: vi.fn() } };

  const prisma = {
    client,
    withTenant: vi.fn(
      async (_tenantId: string, fn: (txArg: unknown) => unknown) => fn(tx),
    ),
  } as unknown as PrismaService;

  return { service: new MembersService(prisma), tx, client };
}

describe("MembersService.list", () => {
  it("returns a paginated member view", async () => {
    const { service, tx } = makeHarness();

    tx.membership.findMany.mockResolvedValue([memberRow()]);
    tx.membership.count.mockResolvedValue(1);

    const result = await service.list("tenant_1", 1, 20);

    expect(result).toEqual({
      success: true,
      data: [
        {
          id: "membership_1",
          userId: "user_1",
          email: "user@example.com",
          name: "User",
          role: "MEMBER",
          createdAt: "2026-10-23T10:00:00.000Z",
        },
      ],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });
});

describe("MembersService.invite", () => {
  it("requires the account to exist first", async () => {
    const { service, client } = makeHarness();

    client.user.findUnique.mockResolvedValue(null);

    await expect(
      service.invite("tenant_1", {
        email: "ghost@example.com",
        role: "MEMBER",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("adds an existing account", async () => {
    const { service, tx, client } = makeHarness();

    client.user.findUnique.mockResolvedValue({
      id: "user_1",
      email: "user@example.com",
      name: "User",
    });
    tx.membership.create.mockResolvedValue(memberRow());

    const member = await service.invite("tenant_1", {
      email: "user@example.com",
      role: "ADMIN",
    });

    expect(member.role).toBe("MEMBER"); // as returned by the mock
    expect(tx.membership.create).toHaveBeenCalledWith({
      data: { tenantId: "tenant_1", userId: "user_1", role: "ADMIN" },
      include: { user: { select: { email: true, name: true } } },
    });
  });

  it("maps duplicate membership to a conflict", async () => {
    const { service, tx, client } = makeHarness();

    client.user.findUnique.mockResolvedValue({
      id: "user_1",
      email: "user@example.com",
      name: null,
    });
    tx.membership.create.mockRejectedValue({ code: "P2002" });

    await expect(
      service.invite("tenant_1", {
        email: "user@example.com",
        role: "MEMBER",
      }),
    ).rejects.toThrow(ConflictError);
  });
});

describe("MembersService.updateRole", () => {
  it("404s when the membership is not in this tenant", async () => {
    const { service, tx } = makeHarness();

    tx.membership.findFirst.mockResolvedValue(null);

    await expect(
      service.updateRole("tenant_1", "membership_x", { role: "ADMIN" }),
    ).rejects.toThrow(NotFoundError);
  });

  it("protects the last owner from demotion", async () => {
    const { service, tx } = makeHarness();

    tx.membership.findFirst.mockResolvedValue(memberRow({ role: "OWNER" }));
    tx.membership.count.mockResolvedValue(0);

    await expect(
      service.updateRole("tenant_1", "membership_1", { role: "MEMBER" }),
    ).rejects.toThrow(/last owner/);
    expect(tx.membership.update).not.toHaveBeenCalled();
  });

  it("demotes an owner when another remains", async () => {
    const { service, tx } = makeHarness();

    tx.membership.findFirst.mockResolvedValue(memberRow({ role: "OWNER" }));
    tx.membership.count.mockResolvedValue(1);
    tx.membership.update.mockResolvedValue(memberRow({ role: "ADMIN" }));

    const updated = await service.updateRole("tenant_1", "membership_1", {
      role: "ADMIN",
    });

    expect(updated.role).toBe("ADMIN");
  });

  it("promotes a member without touching owner checks", async () => {
    const { service, tx } = makeHarness();

    tx.membership.findFirst.mockResolvedValue(memberRow({ role: "MEMBER" }));
    tx.membership.update.mockResolvedValue(memberRow({ role: "ADMIN" }));

    await service.updateRole("tenant_1", "membership_1", { role: "ADMIN" });

    expect(tx.membership.count).not.toHaveBeenCalled();
  });
});

describe("MembersService.remove", () => {
  it("refuses self-removal", async () => {
    const { service, tx } = makeHarness();

    tx.membership.findFirst.mockResolvedValue({
      id: "membership_1",
      userId: "user_1",
      role: "MEMBER",
    });

    await expect(
      service.remove("tenant_1", "membership_1", "user_1"),
    ).rejects.toThrow(/cannot remove themselves/);
    expect(tx.membership.delete).not.toHaveBeenCalled();
  });

  it("protects the last owner from removal", async () => {
    const { service, tx } = makeHarness();

    tx.membership.findFirst.mockResolvedValue({
      id: "membership_1",
      userId: "owner_1",
      role: "OWNER",
    });
    tx.membership.count.mockResolvedValue(0);

    await expect(
      service.remove("tenant_1", "membership_1", "actor_1"),
    ).rejects.toThrow(ValidationError);
    expect(tx.membership.delete).not.toHaveBeenCalled();
  });

  it("removes a regular member", async () => {
    const { service, tx } = makeHarness();

    tx.membership.findFirst.mockResolvedValue({
      id: "membership_1",
      userId: "user_1",
      role: "MEMBER",
    });
    tx.membership.delete.mockResolvedValue({});

    await expect(
      service.remove("tenant_1", "membership_1", "actor_1"),
    ).resolves.toEqual({ success: true });
    expect(tx.membership.delete).toHaveBeenCalledWith({
      where: { id: "membership_1" },
    });
  });
});
