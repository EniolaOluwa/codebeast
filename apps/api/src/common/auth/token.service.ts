import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { UnauthorizedError } from "../errors/errors.ts";
import { signJwt, verifyJwt } from "./jwt.ts";

@Injectable()
export class TokenService {
  private readonly secret: string;

  readonly accessTtlSeconds: number;
  readonly refreshTtlSeconds: number;

  constructor(config: ConfigService) {
    this.secret = config.getOrThrow<string>("JWT_SECRET");
    this.accessTtlSeconds = config.getOrThrow<number>(
      "AUTH_ACCESS_TTL_SECONDS",
    );
    this.refreshTtlSeconds = config.getOrThrow<number>(
      "AUTH_REFRESH_TTL_SECONDS",
    );
  }

  signAccessToken(claims: { userId: string; tenantId: string }): {
    token: string;
    expiresIn: number;
  } {
    const token = signJwt(
      { sub: claims.userId, tid: claims.tenantId },
      this.secret,
      this.accessTtlSeconds,
    );

    return { token, expiresIn: this.accessTtlSeconds };
  }

  verifyAccessToken(token: string): { sub: string; tid: string } {
    try {
      const payload = verifyJwt(token, this.secret);
      return { sub: payload.sub, tid: payload.tid };
    } catch {
      throw new UnauthorizedError("Invalid or expired access token");
    }
  }
}
