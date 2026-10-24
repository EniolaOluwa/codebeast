import { timingSafeEqual } from "node:crypto";

import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { ApiKeyScope, Role } from "@repo/types";

import { PrismaService } from "../../prisma/prisma.service.ts";
import type {
  AuthenticatedRequest,
  RequestContext,
} from "../context/request-context.ts";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator.ts";
import { ROLES_KEY } from "../decorators/roles.decorator.ts";
import { SCOPES_KEY } from "../decorators/scopes.decorator.ts";
import { ForbiddenError, UnauthorizedError } from "../errors/errors.ts";
import { extractApiKeyPrefix, hashApiKey } from "./api-key.ts";
import { JwtService } from "./jwt.service.ts";

/**
 * Single authentication + authorization guard. Resolves either a JWT (dashboard)
 * or a hashed API key (machines), attaches the tenant context to the request,
 * then enforces @Roles / @Scopes if present.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context
      .switchToHttp()
      .getRequest<
        AuthenticatedRequest & { headers: Record<string, string | undefined> }
      >();

    if (isPublic) {
      return true;
    }

    const auth = await this.resolve(request);
    if (!auth) {
      throw new UnauthorizedError();
    }
    request.auth = auth;

    this.enforceRoles(context, auth);
    this.enforceScopes(context, auth);

    return true;
  }

  private async resolve(
    request: AuthenticatedRequest & {
      headers: Record<string, string | undefined>;
    },
  ): Promise<RequestContext | null> {
    const authorization = request.headers.authorization;
    if (authorization?.startsWith("Bearer ")) {
      return this.resolveJwt(authorization.slice(7));
    }

    const apiKey = request.headers["x-api-key"];
    if (apiKey) {
      return this.resolveApiKey(apiKey);
    }

    return null;
  }

  private resolveJwt(token: string): RequestContext {
    const payload = this.jwt.verify(token);
    return {
      tenantId: payload.tid,
      actorType: "USER",
      actorId: payload.sub,
      role: payload.role as Role,
    };
  }

  private async resolveApiKey(apiKey: string): Promise<RequestContext | null> {
    const prefix = extractApiKeyPrefix(apiKey);
    if (!prefix) {
      return null;
    }

    const record = await this.prisma.client.apiKey.findFirst({
      where: { prefix, revokedAt: null },
    });

    if (!record) {
      return null;
    }

    const provided = Buffer.from(hashApiKey(apiKey));
    const expected = Buffer.from(record.keyHash);
    if (
      provided.length !== expected.length ||
      !timingSafeEqual(provided, expected)
    ) {
      return null;
    }

    if (record.expiresAt && record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedError("API key expired");
    }

    void this.prisma.client.apiKey
      .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    return {
      tenantId: record.tenantId,
      actorType: "API_KEY",
      actorId: record.id,
      scopes: record.scopes as ApiKeyScope[],
    };
  }

  private enforceRoles(context: ExecutionContext, auth: RequestContext): void {
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!roles || roles.length === 0) {
      return;
    }

    if (auth.actorType !== "USER" || !auth.role || !roles.includes(auth.role)) {
      throw new ForbiddenError("Insufficient role");
    }
  }

  private enforceScopes(context: ExecutionContext, auth: RequestContext): void {
    const scopes = this.reflector.getAllAndOverride<ApiKeyScope[]>(SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!scopes || scopes.length === 0) {
      return;
    }

    if (auth.actorType !== "API_KEY") {
      return;
    }

    const granted = auth.scopes ?? [];
    const allowed = scopes.every(
      (scope) => granted.includes(scope) || granted.includes("admin"),
    );

    if (!allowed) {
      throw new ForbiddenError("API key missing required scope");
    }
  }
}
