import "reflect-metadata";

import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AppModule } from "../app.module.ts";
import { PrismaService } from "../prisma/prisma.service.ts";
import { REDIS_CLIENT } from "../redis/redis.tokens.ts";

const prismaMock = {
  onModuleInit: (): void => undefined,
  onModuleDestroy: (): void => undefined,
  ping: vi.fn(async (): Promise<void> => undefined),
  client: {},
};

const redisMock = {
  ping: vi.fn(async (): Promise<string> => "PONG"),
  eval: vi.fn(async (): Promise<[number, number]> => [1, 60_000]),
  disconnect: (): void => undefined,
};

describe("Health Routes", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(REDIS_CLIENT)
      .useValue(redisMock)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health returns 200 with status ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("uptime");
    expect(body).toHaveProperty("environment");
  });

  it("GET /health/ready returns 200 when db and redis are up", async () => {
    prismaMock.ping.mockResolvedValueOnce(undefined);
    redisMock.ping.mockResolvedValueOnce("PONG");

    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ready");
    expect(body.checks).toEqual({ db: "up", redis: "up" });
    expect(body).toHaveProperty("timestamp");
  });

  it("GET /health/ready returns 503 when redis is down", async () => {
    prismaMock.ping.mockResolvedValueOnce(undefined);
    redisMock.ping.mockRejectedValueOnce(new Error("connection refused"));

    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(body.error.details.checks).toEqual({ db: "up", redis: "down" });
  });

  it("GET /health/ready returns 503 when db is down", async () => {
    prismaMock.ping.mockRejectedValueOnce(new Error("db unreachable"));
    redisMock.ping.mockResolvedValueOnce("PONG");

    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(body.error.details.checks).toEqual({ db: "down", redis: "up" });
  });
});
