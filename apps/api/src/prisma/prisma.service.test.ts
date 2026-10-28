import { describe, expect, it, vi } from "vitest";

import { PrismaService, RLS_CONTEXT } from "./prisma.service.ts";

describe("PrismaService", () => {
  it("connects, pings and disconnects through the client", async () => {
    const service = new PrismaService();
    const client = {
      $connect: vi.fn().mockResolvedValue(undefined),
      $disconnect: vi.fn().mockResolvedValue(undefined),
      $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
    };
    (service as unknown as { client: typeof client }).client = client;

    await service.onModuleInit();
    expect(client.$connect).toHaveBeenCalledOnce();

    await service.ping();
    expect(client.$queryRaw).toHaveBeenCalledOnce();

    await service.onModuleDestroy();
    expect(client.$disconnect).toHaveBeenCalledOnce();
  });

  it("withTenant sets the tenant GUC inside a transaction", async () => {
    const service = new PrismaService();
    const executeRaw = vi.fn().mockResolvedValue(1);
    const client = {
      $transaction: vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({ $executeRaw: executeRaw }),
        ),
    };
    (service as unknown as { client: typeof client }).client = client;

    const result = await service.withTenant("tenant-123", async () => "done");

    expect(result).toBe("done");
    expect(executeRaw).toHaveBeenCalledOnce();
    // Prisma tagged templates pass the GUC name as a bound value, not inline SQL.
    expect(executeRaw.mock.calls[0]).toEqual(
      expect.arrayContaining([
        expect.anything(),
        RLS_CONTEXT.TENANT,
        "tenant-123",
      ]),
    );
  });
});
