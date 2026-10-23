import { describe, expect, it, vi } from "vitest";

import { ConflictError, NotFoundError } from "../../common/errors/errors.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";
import { RepositoriesService } from "./repositories.service.ts";

const NOW = new Date("2026-10-23T10:00:00.000Z");

function repositoryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "repo_1",
    name: "web",
    fullName: "acme/web",
    defaultBranch: "main",
    githubRepoId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeHarness() {
  const tx = {
    repository: {
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

  return { service: new RepositoriesService(prisma), tx };
}

describe("RepositoriesService", () => {
  it("creates with the tenant claim and ISO-maps the row", async () => {
    const { service, tx } = makeHarness();

    tx.repository.create.mockResolvedValue(repositoryRow());

    const repository = await service.create("tenant_1", {
      name: "web",
      fullName: "acme/web",
      defaultBranch: "main",
    });

    expect(tx.repository.create.mock.calls[0]![0].data).toMatchObject({
      tenantId: "tenant_1",
      fullName: "acme/web",
    });
    expect(repository.createdAt).toBe("2026-10-23T10:00:00.000Z");
  });

  it("maps duplicate full names to a conflict", async () => {
    const { service, tx } = makeHarness();

    tx.repository.create.mockRejectedValue({ code: "P2002" });

    await expect(
      service.create("tenant_1", {
        name: "web",
        fullName: "acme/web",
        defaultBranch: "main",
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("paginates", async () => {
    const { service, tx } = makeHarness();

    tx.repository.findMany.mockResolvedValue([repositoryRow()]);
    tx.repository.count.mockResolvedValue(1);

    const result = await service.list("tenant_1", 2, 10);

    expect(result.pagination).toEqual({
      page: 2,
      limit: 10,
      total: 1,
      totalPages: 1,
    });
  });

  it("404s for missing rows", async () => {
    const { service, tx } = makeHarness();

    tx.repository.findFirst.mockResolvedValue(null);
    await expect(service.get("tenant_1", "nope")).rejects.toThrow(
      NotFoundError,
    );

    tx.repository.findFirst.mockResolvedValue(null);
    await expect(
      service.update("tenant_1", "nope", { name: "x" }),
    ).rejects.toThrow(NotFoundError);

    tx.repository.findFirst.mockResolvedValue(null);
    await expect(service.remove("tenant_1", "nope")).rejects.toThrow(
      NotFoundError,
    );
  });

  it("passes only provided fields on update", async () => {
    const { service, tx } = makeHarness();

    tx.repository.findFirst.mockResolvedValue({ id: "repo_1" });
    tx.repository.update.mockResolvedValue(
      repositoryRow({ defaultBranch: "develop" }),
    );

    await service.update("tenant_1", "repo_1", { defaultBranch: "develop" });

    expect(tx.repository.update.mock.calls[0]![0].data).toEqual({
      defaultBranch: "develop",
    });
  });
});
