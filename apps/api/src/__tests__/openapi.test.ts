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

const prismaMock = {
  onModuleInit: (): void => undefined,
  onModuleDestroy: (): void => undefined,
  ping: async (): Promise<void> => undefined,
  client: {},
};

describe("OpenAPI document", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
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

  it("scans every controller without hanging", () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle("CodeBeast API").setVersion("1").build(),
    );

    expect(Object.keys(document.paths).length).toBeGreaterThan(0);
    expect(document.paths["/api-keys"]).toBeDefined();
    expect(document.paths["/webhooks/{source}/{integrationId}"]).toBeDefined();
  });

  it("documents a typed success response for every operation", () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle("CodeBeast API").setVersion("1").build(),
    );

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
          expect(
            response.content?.["application/json"]?.schema,
            `${method.toUpperCase()} ${path} ${status}`,
          ).toBeDefined();
        }
      }
    }
  });
});
