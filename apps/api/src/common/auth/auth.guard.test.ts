import "reflect-metadata";

import { randomBytes } from "node:crypto";

import { Controller, Get } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { PrismaService } from "../../prisma/prisma.service.ts";
import { CryptoService } from "../crypto/crypto.service.ts";
import { AuthGuard } from "./auth.guard.ts";
import { CurrentPrincipal, Public, Roles, Scopes } from "./decorators.ts";
import type { Principal } from "./principal.ts";
import { TokenService } from "./token.service.ts";

const values: Record<string, unknown> = {
  ENCRYPTION_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
  JWT_SECRET: "s".repeat(32),
  AUTH_ACCESS_TTL_SECONDS: 900,
  AUTH_REFRESH_TTL_SECONDS: 1_209_600,
};

const config = {
  getOrThrow: (key: string): unknown => values[key],
} as unknown as ConfigService;

const crypto = new CryptoService(config);
const tokens = new TokenService(config);

@Controller("probe")
class ProbeController {
  @Get("open")
  @Public()
  open(): { ok: true } {
    return { ok: true };
  }

  @Get("whoami")
  whoami(@CurrentPrincipal() principal: Principal): Principal {
    return principal;
  }

  @Get("owner")
  @Roles("OWNER")
  owner(): { ok: true } {
    return { ok: true };
  }

  @Get("scoped")
  @Scopes("issues:read")
  scoped(): { ok: true } {
    return { ok: true };
  }

  @Get("both")
  @Roles("ADMIN")
  @Scopes("issues:read")
  both(): { ok: true } {
    return { ok: true };
  }
}

describe("AuthGuard", () => {
  let app: NestFastifyApplication;

  const prisma = {
    client: { user: { findUnique: vi.fn() } },
    withRls: vi.fn(),
    withTenant: vi.fn(async (): Promise<undefined> => undefined),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
      providers: [
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: PrismaService, useValue: prisma },
        { provide: TokenService, useValue: tokens },
        { provide: CryptoService, useValue: crypto },
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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const inject = (url: string, headers: Record<string, string> = {}) =>
    app.inject({ method: "GET", url, headers });

  function stubUser(role: "OWNER" | "ADMIN" | "MEMBER"): string {
    prisma.withRls.mockImplementation(
      async (_context, fn: (tx: unknown) => unknown) =>
        fn({ membership: { findUnique: async () => ({ role }) } }),
    );
    prisma.client.user.findUnique.mockResolvedValue({
      email: "user@example.com",
    });

    return tokens.signAccessToken({ userId: "user_1", tenantId: "tenant_1" })
      .token;
  }

  function stubApiKey(scopes: string[], revoked = false): string {
    const raw = `cb_live_${randomBytes(4).toString("hex")}_${crypto.randomToken(16)}`;

    prisma.withRls.mockImplementation(
      async (_context, fn: (tx: unknown) => unknown) =>
        fn({
          apiKey: {
            findUnique: async () => ({
              id: "key_1",
              tenantId: "tenant_1",
              keyHash: crypto.hash(raw),
              scopes,
              revokedAt: revoked ? new Date() : null,
            }),
          },
        }),
    );

    return raw;
  }

  it("lets public routes through without credentials", async () => {
    expect((await inject("/probe/open")).statusCode).toBe(200);
  });

  it("401s without or with malformed credentials", async () => {
    expect((await inject("/probe/whoami")).statusCode).toBe(401);
    expect(
      (
        await inject("/probe/whoami", {
          authorization: "Bearer garbage",
        })
      ).statusCode,
    ).toBe(401);
  });

  it("attaches a user principal resolved from membership", async () => {
    const token = stubUser("MEMBER");

    const res = await inject("/probe/whoami", {
      authorization: `Bearer ${token}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      type: "user",
      userId: "user_1",
      tenantId: "tenant_1",
      role: "MEMBER",
    });
  });

  it("enforces @Roles for user sessions", async () => {
    const token = stubUser("MEMBER");
    const auth = { authorization: `Bearer ${token}` };

    expect((await inject("/probe/owner", auth)).statusCode).toBe(403);

    stubUser("OWNER");
    expect((await inject("/probe/owner", auth)).statusCode).toBe(200);
  });

  it("lets users (role-gated) past @Scopes but requires scopes from API keys", async () => {
    const raw = stubApiKey(["issues:read"]);

    expect(
      (await inject("/probe/scoped", { authorization: `Bearer ${raw}` }))
        .statusCode,
    ).toBe(200);

    // @Roles without @Scopes denies API keys by default.
    expect(
      (await inject("/probe/owner", { authorization: `Bearer ${raw}` }))
        .statusCode,
    ).toBe(403);

    // Both annotations: scope check applies to the key.
    expect(
      (await inject("/probe/both", { authorization: `Bearer ${raw}` }))
        .statusCode,
    ).toBe(200);
  });

  it("403s API keys missing the required scope", async () => {
    const raw = stubApiKey(["repositories:read"]);

    expect(
      (await inject("/probe/scoped", { authorization: `Bearer ${raw}` }))
        .statusCode,
    ).toBe(403);
  });

  it("401s revoked keys and keys presented with a wrong secret", async () => {
    const revoked = stubApiKey(["issues:read"], true);
    expect(
      (await inject("/probe/scoped", { authorization: `Bearer ${revoked}` }))
        .statusCode,
    ).toBe(401);

    const raw = stubApiKey(["issues:read"]);
    const tampered = `${raw.split("_").slice(0, 2).join("_")}_wrongsecret`;
    expect(
      (await inject("/probe/scoped", { authorization: `Bearer ${tampered}` }))
        .statusCode,
    ).toBe(401);
  });

  it("touches lastUsedAt on successful API key auth", async () => {
    const raw = stubApiKey(["issues:read"]);

    await inject("/probe/scoped", { authorization: `Bearer ${raw}` });

    expect(prisma.withTenant).toHaveBeenCalledOnce();
  });
});
