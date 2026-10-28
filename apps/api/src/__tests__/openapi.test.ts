import "reflect-metadata";

import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../app.module.ts";
import { PrismaService } from "../prisma/prisma.service.ts";
import { REDIS_CLIENT } from "../redis/redis.tokens.ts";

const prismaMock = {
  onModuleInit: (): void => undefined,
  onModuleDestroy: (): void => undefined,
  ping: async (): Promise<void> => undefined,
  client: {},
};

const redisMock = {
  ping: async (): Promise<string> => "PONG",
  eval: async (): Promise<[number, number]> => [1, 60_000],
  disconnect: (): void => undefined,
};

function isPublicPath(path: string): boolean {
  return (
    path === "/health" ||
    path.startsWith("/health/") ||
    path.includes("/auth/login") ||
    path.includes("/auth/register") ||
    path.includes("/auth/refresh") ||
    path.includes("/auth/logout") ||
    path.includes("/webhooks")
  );
}

describe("OpenAPI document", () => {
  let app: NestFastifyApplication;
  let document: ReturnType<typeof SwaggerModule.createDocument>;

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

    document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle("CodeBeast API")
        .setVersion("1")
        .addBearerAuth()
        .build(),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it("scans every controller without hanging", () => {
    expect(Object.keys(document.paths).length).toBeGreaterThan(0);

    const paths = Object.keys(document.paths);
    expect(paths.some((path) => path.endsWith("/api-keys"))).toBe(true);
    expect(paths.some((path) => path.endsWith("/audit-logs"))).toBe(true);
    expect(paths.some((path) => path.includes("/webhooks/"))).toBe(true);
  });

  it("documents a typed success response for every operation", () => {
    for (const [path, item] of Object.entries(document.paths)) {
      for (const [method, operation] of Object.entries(item)) {
        if (
          !["get", "post", "put", "patch", "delete"].includes(method) ||
          operation === undefined
        ) {
          continue;
        }

        const successResponses = Object.entries(
          operation.responses as Record<
            string,
            { content?: Record<string, { schema?: unknown }> }
          >,
        ).filter(([status]) => status.startsWith("2"));
        expect(
          successResponses,
          `${method.toUpperCase()} ${path}`,
        ).not.toHaveLength(0);

        for (const [status, response] of successResponses) {
          // Some endpoints (e.g. logout) only declare status without a body schema.
          if (!response.content) {
            continue;
          }
          expect(
            response.content["application/json"]?.schema,
            `${method.toUpperCase()} ${path} ${status}`,
          ).toBeDefined();
        }
      }
    }
  });

  it("requires security on non-public operations", () => {
    for (const [path, item] of Object.entries(document.paths)) {
      if (isPublicPath(path)) {
        continue;
      }

      for (const [method, operation] of Object.entries(item)) {
        if (
          !["get", "post", "put", "patch", "delete"].includes(method) ||
          operation === undefined ||
          typeof operation !== "object"
        ) {
          continue;
        }

        const op = operation as { security?: unknown[] };
        expect(
          op.security?.length ?? 0,
          `${method.toUpperCase()} ${path} missing security`,
        ).toBeGreaterThan(0);
      }
    }
  });
});
