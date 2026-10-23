import "reflect-metadata";

import type { ExecutionContext } from "@nestjs/common";
import { type CanActivate, Controller, Get, Injectable } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Principal } from "../auth/principal.ts";
import { TenantContextInterceptor } from "./tenant-context.interceptor.ts";
import { TenantContextService } from "./tenant-context.service.ts";

/** Test-only stand-in for AuthGuard: sets a principal from a header. */
@Injectable()
class PrincipalStubGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      principal?: Principal;
    }>();
    const tenantId = request.headers["x-test-tenant"];

    if (typeof tenantId === "string") {
      request.principal = {
        type: "user",
        userId: "user_1",
        tenantId,
        email: "user@example.com",
        role: "MEMBER",
      };
    }

    return true;
  }
}

@Controller("ctx")
class CtxController {
  constructor(private readonly tenantContext: TenantContextService) {}

  @Get()
  async read(): Promise<{
    sync: string | null;
    afterAwait: string | null;
  }> {
    const sync = this.tenantContext.get()?.tenantId ?? null;
    await new Promise((resolve) => setTimeout(resolve, 10));
    const afterAwait = this.tenantContext.get()?.tenantId ?? null;

    return { sync, afterAwait };
  }
}

describe("TenantContextInterceptor", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CtxController],
      providers: [
        TenantContextService,
        { provide: APP_GUARD, useClass: PrincipalStubGuard },
        { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("runs the handler inside the principal's tenant context (across awaits)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/ctx",
      headers: { "x-test-tenant": "tenant_42" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ sync: "tenant_42", afterAwait: "tenant_42" });
  });

  it("leaves unauthenticated requests without ambient context", async () => {
    const res = await app.inject({ method: "GET", url: "/ctx" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ sync: null, afterAwait: null });
  });
});
