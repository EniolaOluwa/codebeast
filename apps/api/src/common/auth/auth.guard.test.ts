import type { ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";

import type { PrismaService } from "../../prisma/prisma.service.ts";
import { generateApiKey } from "./api-key.ts";
import { AuthGuard } from "./auth.guard.ts";
import type { JwtService } from "./jwt.service.ts";

type Metadata = Record<string, unknown>;

function makeContext(headers: Record<string, string | undefined>) {
  const request = { headers };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => class {},
  } as unknown as ExecutionContext;
  return { context, request: request as typeof request & { auth?: unknown } };
}

function makeGuard(
  meta: Metadata,
  options: {
    jwtPayload?: Record<string, unknown>;
    apiKeyRecord?: Record<string, unknown> | null;
  } = {},
): AuthGuard {
  const reflector = {
    getAllAndOverride: (key: string) => meta[key],
  } as unknown as Reflector;

  const jwt = {
    verify: () => options.jwtPayload,
  } as unknown as JwtService;

  const prisma = {
    client: {
      apiKey: {
        findFirst: vi.fn().mockResolvedValue(options.apiKeyRecord ?? null),
        update: vi.fn().mockResolvedValue(undefined),
      },
    },
  } as unknown as PrismaService;

  return new AuthGuard(reflector, jwt, prisma);
}

describe("AuthGuard", () => {
  it("allows @Public routes without credentials", async () => {
    const guard = makeGuard({ isPublic: true });
    const { context } = makeContext({});
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("rejects requests without credentials", async () => {
    const guard = makeGuard({});
    const { context } = makeContext({});
    await expect(guard.canActivate(context)).rejects.toThrow(/Unauthorized/);
  });

  it("attaches tenant context for a valid JWT", async () => {
    const guard = makeGuard(
      {},
      {
        jwtPayload: {
          sub: "user-1",
          tid: "tenant-1",
          role: "MEMBER",
        },
      },
    );
    const { context, request } = makeContext({
      authorization: "Bearer token",
    });

    await guard.canActivate(context);
    expect(request.auth).toMatchObject({
      tenantId: "tenant-1",
      actorType: "USER",
      actorId: "user-1",
      role: "MEMBER",
    });
  });

  it("enforces @Roles for user actors", async () => {
    const guard = makeGuard(
      { roles: ["ADMIN"] },
      { jwtPayload: { sub: "u", tid: "t", role: "VIEWER" } },
    );
    const { context } = makeContext({ authorization: "Bearer token" });

    await expect(guard.canActivate(context)).rejects.toThrow(
      /Insufficient role/,
    );
  });

  it("authenticates a valid API key", async () => {
    const generated = generateApiKey();
    const guard = makeGuard(
      {},
      {
        apiKeyRecord: {
          id: "key-1",
          tenantId: "tenant-1",
          prefix: generated.prefix,
          keyHash: generated.keyHash,
          scopes: ["issues:read"],
          expiresAt: null,
        },
      },
    );
    const { context, request } = makeContext({
      "x-api-key": generated.fullKey,
    });

    await guard.canActivate(context);
    expect(request.auth).toMatchObject({
      tenantId: "tenant-1",
      actorType: "API_KEY",
      actorId: "key-1",
    });
  });

  it("rejects an API key missing a required scope", async () => {
    const generated = generateApiKey();
    const guard = makeGuard(
      { scopes: ["issues:write"] },
      {
        apiKeyRecord: {
          id: "key-1",
          tenantId: "tenant-1",
          prefix: generated.prefix,
          keyHash: generated.keyHash,
          scopes: ["issues:read"],
          expiresAt: null,
        },
      },
    );
    const { context } = makeContext({ "x-api-key": generated.fullKey });

    await expect(guard.canActivate(context)).rejects.toThrow(
      /missing required scope/,
    );
  });

  it("rejects an invalid API key secret", async () => {
    const generated = generateApiKey();
    const guard = makeGuard(
      {},
      {
        apiKeyRecord: {
          id: "key-1",
          tenantId: "tenant-1",
          prefix: generated.prefix,
          keyHash: "different-hash",
          scopes: [],
          expiresAt: null,
        },
      },
    );
    const { context } = makeContext({ "x-api-key": generated.fullKey });

    await expect(guard.canActivate(context)).rejects.toThrow(/Unauthorized/);
  });
});
