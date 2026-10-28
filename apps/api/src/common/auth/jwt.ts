import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Minimal HS256 JWT implementation (ADR-003). We only ever mint and accept
 * our own header, so there is no `alg` negotiation to confuse: any header
 * other than the exact expected one is rejected.
 */

export const JWT_ISSUER = "codebeast";

export interface JwtPayload {
  sub: string;
  tid: string;
  iss: string;
  iat: number;
  exp: number;
}

export class JwtError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JwtError";
  }
}

const HEADER = Buffer.from(
  JSON.stringify({ alg: "HS256", typ: "JWT" }),
).toString("base64url");

function signature(input: string, secret: string): string {
  return createHmac("sha256", secret).update(input).digest("base64url");
}

function encode(payload: object): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decode<T>(segment: string): T {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as T;
}

export function signJwt(
  claims: { sub: string; tid: string },
  secret: string,
  expiresInSeconds: number,
  now = Date.now(),
): string {
  const issuedAt = Math.floor(now / 1000);
  const payload: JwtPayload = {
    sub: claims.sub,
    tid: claims.tid,
    iss: JWT_ISSUER,
    iat: issuedAt,
    exp: issuedAt + expiresInSeconds,
  };

  const body = `${HEADER}.${encode(payload)}`;
  return `${body}.${signature(body, secret)}`;
}

export function verifyJwt(
  token: string,
  secret: string,
  now = Date.now(),
): JwtPayload {
  const parts = token.split(".");

  if (parts.length !== 3) {
    throw new JwtError("Malformed token");
  }

  const [header, body, providedSignature] = parts as [string, string, string];

  if (header !== HEADER) {
    throw new JwtError("Unsupported token header");
  }

  const expectedSignature = signature(`${header}.${body}`, secret);
  const provided = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);

  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    throw new JwtError("Invalid token signature");
  }

  const payload = decode<JwtPayload>(body);

  if (
    typeof payload.sub !== "string" ||
    typeof payload.tid !== "string" ||
    typeof payload.exp !== "number" ||
    payload.iss !== JWT_ISSUER
  ) {
    throw new JwtError("Invalid token payload");
  }

  if (payload.exp * 1000 <= now) {
    throw new JwtError("Token expired");
  }

  return payload;
}
