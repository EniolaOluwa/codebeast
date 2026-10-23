import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { ApiKeyScope, MembershipRole } from "@repo/types";
import type { FastifyRequest } from "fastify";

import { PrismaService, RLS_CONTEXT } from "../../prisma/prisma.service.ts";
import { CryptoService } from "../crypto/crypto.service.ts";
import { ForbiddenError, UnauthorizedError } from "../errors/errors.ts";
import { IS_PUBLIC_KEY, ROLES_KEY, SCOPES_KEY } from "./decorators.ts";
import { parseApiKey, type Principal } from "./principal.ts";
import { TokenService } from "./token.service.ts";

export interface AuthenticatedRequest extends FastifyRequest {
  principal?: Principal;
}

/**
 * Single guard for both credential types (ADR-003): JWT for humans, hashed
 * API keys for machines. Authorization metadata:
 * - `@Roles(...)`   — user sessions only; API keys are denied by default.
 * - `@Scopes(...)`  — API keys must carry at least one of the scopes; user
 *   sessions pass (their access is role-gated instead).
 * - neither         — any authenticated principal may proceed.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly crypto: CryptoService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];

    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      targets,
    );

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const [scheme, token] = (request.headers.authorization ?? "").split(" ");

    if (scheme?.toLowerCase() !== "bearer" || !token) {
      throw new UnauthorizedError("Missing bearer token");
    }

    const principal = await this.authenticate(token);

    const roles =
      this.reflector.getAllAndOverride<MembershipRole[]>(ROLES_KEY, targets) ??
      [];
    const scopes =
      this.reflector.getAllAndOverride<ApiKeyScope[]>(SCOPES_KEY, targets) ??
      [];

    if (principal.type === "user") {
      if (roles.length > 0 && !roles.includes(principal.role)) {
        throw new ForbiddenError(
          `This action requires one of: ${roles.join(", ")}`,
        );
      }
    } else {
      if (roles.length > 0 && scopes.length === 0) {
        throw new ForbiddenError("This endpoint requires a user session");
      }

      if (
        scopes.length > 0 &&
        !scopes.some((scope) => principal.scopes.includes(scope))
      ) {
        throw new ForbiddenError(
          `API key is missing one of these scopes: ${scopes.join(", ")}`,
        );
      }
    }

    request.principal = principal;
    return true;
  }

  private async authenticate(token: string): Promise<Principal> {
    if (parseApiKey(token)) {
      return this.authenticateApiKey(token);
    }

    return this.authenticateUser(token);
  }

  private async authenticateUser(token: string): Promise<Principal> {
    const claims = this.tokens.verifyAccessToken(token);

    const membership = await this.prisma.withRls(
      { [RLS_CONTEXT.USER]: claims.sub },
      async (tx) =>
        tx.membership.findUnique({
          where: {
            tenantId_userId: { tenantId: claims.tid, userId: claims.sub },
          },
        }),
    );

    if (!membership) {
      throw new UnauthorizedError("Access to this tenant has been revoked");
    }

    const user = await this.prisma.client.user.findUnique({
      where: { id: claims.sub },
      select: { email: true },
    });

    if (!user) {
      throw new UnauthorizedError("Account no longer exists");
    }

    return {
      type: "user",
      userId: claims.sub,
      tenantId: claims.tid,
      email: user.email,
      role: membership.role,
    };
  }

  private async authenticateApiKey(rawKey: string): Promise<Principal> {
    const parsed = parseApiKey(rawKey);

    if (!parsed) {
      throw new UnauthorizedError("Invalid API key");
    }

    const key = await this.prisma.withRls(
      { [RLS_CONTEXT.API_KEY_PREFIX]: parsed.prefix },
      async (tx) => tx.apiKey.findUnique({ where: { prefix: parsed.prefix } }),
    );

    if (
      !key ||
      key.revokedAt ||
      !this.crypto.safeEqual(key.keyHash, this.crypto.hash(rawKey))
    ) {
      throw new UnauthorizedError("Invalid API key");
    }

    void this.touchLastUsed(key.tenantId, key.id);

    return {
      type: "api_key",
      apiKeyId: key.id,
      tenantId: key.tenantId,
      scopes: key.scopes,
    };
  }

  private async touchLastUsed(
    tenantId: string,
    apiKeyId: string,
  ): Promise<void> {
    try {
      await this.prisma.withTenant(tenantId, async (tx) =>
        tx.apiKey.update({
          where: { id: apiKeyId },
          data: { lastUsedAt: new Date() },
        }),
      );
    } catch {
      // Best effort only: a failed touch must not break authentication.
    }
  }
}
