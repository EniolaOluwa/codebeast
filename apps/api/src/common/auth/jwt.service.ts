import { createHmac, timingSafeEqual } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { UnauthorizedError } from "../errors/errors.ts";

export interface AccessTokenPayload {
  sub: string;
  tid: string;
  role: string;
  iat: number;
  exp: number;
}

interface SignablePayload {
  sub: string;
  tid: string;
  role: string;
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input, "base64url");
}

/**
 * Minimal HS256 JWT implementation (sign/verify only) so the API does not depend
 * on a JWT library. See apps/api/decisions.md.
 */
@Injectable()
export class JwtService {
  private readonly secret: string;
  private readonly accessTtl: number;

  constructor(config: ConfigService) {
    this.secret = config.getOrThrow<string>("JWT_SECRET");
    this.accessTtl = config.getOrThrow<number>("JWT_ACCESS_TTL");
  }

  sign(payload: SignablePayload): string {
    const issuedAt = Math.floor(Date.now() / 1000);
    const header = base64UrlEncode(
      JSON.stringify({ alg: "HS256", typ: "JWT" }),
    );
    const body = base64UrlEncode(
      JSON.stringify({
        ...payload,
        iat: issuedAt,
        exp: issuedAt + this.accessTtl,
      }),
    );
    const signature = this.signature(`${header}.${body}`);
    return `${header}.${body}.${signature}`;
  }

  verify(token: string): AccessTokenPayload {
    const [header, body, signature] = token.split(".");
    if (!header || !body || !signature) {
      throw new UnauthorizedError("Malformed token");
    }

    const expected = this.signature(`${header}.${body}`);
    const provided = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);

    if (
      provided.length !== expectedBuffer.length ||
      !timingSafeEqual(provided, expectedBuffer)
    ) {
      throw new UnauthorizedError("Invalid token signature");
    }

    const payload = JSON.parse(
      base64UrlDecode(body).toString("utf8"),
    ) as AccessTokenPayload;

    if (payload.exp * 1000 < Date.now()) {
      throw new UnauthorizedError("Token expired");
    }

    return payload;
  }

  get accessTtlSeconds(): number {
    return this.accessTtl;
  }

  private signature(data: string): string {
    return createHmac("sha256", this.secret).update(data).digest("base64url");
  }
}
