import { describe, expect, it, vi } from "vitest";

import { TenantContext } from "../common/context/tenant-context.ts";
import { PrismaService } from "./prisma.service.ts";

function makeContext(tenantId: string | undefined): TenantContext {
  return {
    requireTenantId: (): string => {
      if (!tenantId) {
        throw new Error("no tenant");
      }
      return tenantId;
    },
  } as unknown as TenantContext;
}

describe("PrismaService", () => {
  it("connects, pings and disconnects through the client", async () => {
    const service = new PrismaService(makeContext(undefined));
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
    const service = new PrismaService(makeContext("tenant-123"));
    const executeRaw = vi.fn().mockResolvedValue(1);
    const client = {
      $transaction: vi
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({ $executeRaw: executeRaw }),
        ),
    };
    (service as unknown as { client: typeof client }).client = client;

    const result = await service.withTenant(async () => "done");

    expect(result).toBe("done");
    expect(executeRaw).toHaveBeenCalledOnce();
  });
});
