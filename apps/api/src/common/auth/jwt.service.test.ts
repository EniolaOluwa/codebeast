import type { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";

import { JwtService } from "./jwt.service.ts";

function makeService(ttl = 900): JwtService {
  const values: Record<string, unknown> = {
    JWT_SECRET: "unit-test-secret-value-that-is-long-enough",
    JWT_ACCESS_TTL: ttl,
  };
  const config = {
    getOrThrow: (key: string): unknown => values[key],
  } as unknown as ConfigService;
  return new JwtService(config);
}

describe("JwtService", () => {
  it("signs and verifies a round trip", () => {
    const service = makeService();
    const token = service.sign({
      sub: "user-1",
      tid: "tenant-1",
      role: "OWNER",
    });
    const payload = service.verify(token);

    expect(payload.sub).toBe("user-1");
    expect(payload.tid).toBe("tenant-1");
    expect(payload.role).toBe("OWNER");
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });

  it("rejects a tampered payload", () => {
    const service = makeService();
    const token = service.sign({
      sub: "user-1",
      tid: "tenant-1",
      role: "VIEWER",
    });
    const [header, , signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({
        sub: "user-1",
        tid: "tenant-1",
        role: "OWNER",
        iat: 1,
        exp: 9_999_999_999,
      }),
    ).toString("base64url");

    expect(() => service.verify(`${header}.${forged}.${signature}`)).toThrow(
      /Invalid token signature/,
    );
  });

  it("rejects a malformed token", () => {
    expect(() => makeService().verify("not-a-token")).toThrow(
      /Malformed token/,
    );
  });
});
