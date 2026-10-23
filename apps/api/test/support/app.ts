import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test, type TestingModuleBuilder } from "@nestjs/testing";

import { AppModule } from "../../src/app.module.ts";
import { PrismaService } from "../../src/prisma/prisma.service.ts";
import type { TestPrismaClient } from "./database.ts";

/**
 * Binds the real `PrismaService` (so `withTenant`/`withRls` production code
 * runs) to a test database client.
 */
export function bindPrismaService(client: TestPrismaClient): PrismaService {
  const service = new PrismaService();
  (service as unknown as { client: TestPrismaClient }).client = client;
  return service;
}

export interface TestAppOptions {
  /** When set, `PrismaService` is overridden with a client-bound instance. */
  client?: TestPrismaClient;
  /** Extra provider overrides (e.g. the queue publisher). */
  override?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

export async function createTestApp(
  options: TestAppOptions = {},
): Promise<NestFastifyApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] });

  if (options.client) {
    builder = builder
      .overrideProvider(PrismaService)
      .useValue(bindPrismaService(options.client));
  }

  builder = options.override?.(builder) ?? builder;

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter(),
  );

  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return app;
}
