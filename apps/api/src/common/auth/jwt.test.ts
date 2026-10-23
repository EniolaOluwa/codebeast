import { describe, expect, it } from "vitest";

import { JWT_ISSUER, JwtError, signJwt, verifyJwt } from "./jwt.ts";

const SECRET = "s".repeat(32);
const claims = { sub: "user_1", tid: "tenant_1" };

describe("jwt (HS256)", () => {
  it("round-trips claims with iat/exp", () => {
    const payload = verifyJwt(signJwt(claims, SECRET, 900), SECRET);

    expect(payload.sub).toBe("user_1");
    expect(payload.tid).toBe("tenant_1");
    expect(payload.iss).toBe(JWT_ISSUER);
    expect(payload.exp - payload.iat).toBe(900);
  });

  it("rejects a token signed with another secret", () => {
    const token = signJwt(claims, "x".repeat(32), 900);

    expect(() => verifyJwt(token, SECRET)).toThrow(JwtError);
  });

  it("rejects expired tokens", () => {
    const now = Date.now();
    const token = signJwt(claims, SECRET, 60, now);

    expect(() => verifyJwt(token, SECRET, now + 61_000)).toThrow(/expired/i);
  });

  it("rejects tampered payloads even if the header is untouched", () => {
    const [header, , signature] = signJwt(claims, SECRET, 900).split(".");
    const forged = Buffer.from(
      JSON.stringify({
        sub: "admin",
        tid: "tenant_1",
        iss: JWT_ISSUER,
        iat: 0,
        exp: 9_999_999_999,
      }),
    ).toString("base64url");

    expect(() => verifyJwt(`${header}.${forged}.${signature}`, SECRET)).toThrow(
      /signature/,
    );
  });

  it("rejects headers other than our exact HS256 header (no alg confusion)", () => {
    const body = Buffer.from(
      JSON.stringify({
        sub: "user_1",
        tid: "tenant_1",
        iss: JWT_ISSUER,
        iat: 0,
        exp: 9_999_999_999,
      }),
    ).toString("base64url");
    const header = Buffer.from(
      JSON.stringify({ alg: "none", typ: "JWT" }),
    ).toString("base64url");

    expect(() => verifyJwt(`${header}.${body}.`, SECRET)).toThrow(/header/i);
  });

  it("rejects malformed tokens", () => {
    expect(() => verifyJwt("not-a-token", SECRET)).toThrow(/malformed/i);
    expect(() => verifyJwt("a.b", SECRET)).toThrow(/malformed/i);
  });
});
