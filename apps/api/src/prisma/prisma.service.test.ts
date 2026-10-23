import { describe, expect, it, vi } from "vitest";

import { PrismaService } from "./prisma.service.ts";

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
});
