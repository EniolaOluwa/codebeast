import type { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";

import type { RunOrchestrator } from "./run-orchestrator.service.ts";
import { WorkersService } from "./workers.service.ts";

function makeService(env: string): WorkersService {
  const config = {
    getOrThrow: (key: string): unknown =>
      key === "NODE_ENV" ? env : "redis://localhost:6379",
  } as unknown as ConfigService;

  return new WorkersService({} as unknown as RunOrchestrator, config);
}

describe("WorkersService", () => {
  it("stays inert under NODE_ENV=test (tests drive the orchestrator directly)", () => {
    const service = makeService("test");

    service.onModuleInit();

    expect(Reflect.get(service, "workers")).toHaveLength(0);
  });

  it("closing is idempotent when no workers were started", async () => {
    const service = makeService("test");

    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });
});
