import type { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";

import { UnauthorizedError } from "../errors/errors.ts";
import { signJwt } from "./jwt.ts";
import { TokenService } from "./token.service.ts";

const SECRET = "s".repeat(32);

function makeService(overrides: Record<string, unknown> = {}): TokenService {
  const values: Record<string, unknown> = {
    JWT_SECRET: SECRET,
    AUTH_ACCESS_TTL_SECONDS: 900,
    AUTH_REFRESH_TTL_SECONDS: 1_209_600,
    ...overrides,
  };

  const config = {
    getOrThrow: (key: string): unknown => values[key],
  } as unknown as ConfigService;

  return new TokenService(config);
}

describe("TokenService", () => {
  it("signs access tokens carrying the user and tenant", () => {
    const service = makeService();
    const { token, expiresIn } = service.signAccessToken({
      userId: "user_1",
      tenantId: "tenant_1",
    });

    expect(expiresIn).toBe(900);
    expect(service.verifyAccessToken(token)).toEqual({
      sub: "user_1",
      tid: "tenant_1",
    });
  });

  it("maps any verification failure to 401", () => {
    const service = makeService();

    expect(() => service.verifyAccessToken("garbage")).toThrow(
      UnauthorizedError,
    );

    const foreign = signJwt({ sub: "u", tid: "t" }, "z".repeat(32), 900);
    expect(() => service.verifyAccessToken(foreign)).toThrow(UnauthorizedError);
  });

  it("rejects expired access tokens", () => {
    const service = makeService();
    const expired = signJwt(
      { sub: "user_1", tid: "tenant_1" },
      SECRET,
      60,
      Date.now() - 120_000,
    );

    expect(() => service.verifyAccessToken(expired)).toThrow(UnauthorizedError);
  });
});
