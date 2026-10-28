import { describe, expect, it } from "vitest";

import { TenantContextService } from "./tenant-context.service.ts";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe("TenantContextService", () => {
  it("propagates context across async boundaries", async () => {
    const service = new TenantContextService();

    await service.run({ tenantId: "t1" }, async () => {
      await sleep(1);
      expect(service.requireTenantId()).toBe("t1");
    });
  });

  it("isolates concurrent runs", async () => {
    const service = new TenantContextService();

    const [a, b] = await Promise.all([
      service.run({ tenantId: "tenant-a" }, async () => {
        await sleep(2);
        return service.requireTenantId();
      }),
      service.run({ tenantId: "tenant-b" }, async () => {
        await sleep(1);
        return service.requireTenantId();
      }),
    ]);

    expect(a).toBe("tenant-a");
    expect(b).toBe("tenant-b");
  });

  it("restores the outer context after a nested run", () => {
    const service = new TenantContextService();

    service.run({ tenantId: "outer" }, () => {
      service.run({ tenantId: "inner" }, () => {
        expect(service.requireTenantId()).toBe("inner");
      });
      expect(service.requireTenantId()).toBe("outer");
    });
  });

  it("throws when no context is active", () => {
    const service = new TenantContextService();

    expect(service.get()).toBeUndefined();
    expect(() => service.requireTenantId()).toThrow(/No tenant context/);
  });
});
