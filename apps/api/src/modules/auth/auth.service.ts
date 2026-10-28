import { Injectable, Logger, Optional } from "@nestjs/common";
import type {
  AuthTokens,
  LoginInput,
  Me,
  MembershipRole,
  RefreshInput,
  RegisterInput,
  User,
} from "@repo/types";

import { hashPassword, verifyPassword } from "../../common/auth/password.ts";
import type { UserPrincipal } from "../../common/auth/principal.ts";
import { TokenService } from "../../common/auth/token.service.ts";
import { CryptoService } from "../../common/crypto/crypto.service.ts";
import {
  ConflictError,
  UnauthorizedError,
} from "../../common/errors/errors.ts";
import { newId, newSlug } from "../../common/ids.ts";
import { PrismaService, RLS_CONTEXT } from "../../prisma/prisma.service.ts";
import { AuditService } from "../audit/audit.service.ts";

/**
 * Verified against when the email does not exist, so failed logins cost the
 * same time as successful ones (no user enumeration via timing).
 */
const DUMMY_PASSWORD_HASH =
  "scrypt$16384$8$1$GZsDC_LH68jZSYrsSJe1Yw$R_UuDr3miIKuMCmV5o1DEFsnng-i8Pzd0ft7IhXyyacQiVsk5ugeESOVD_wEcOM9TGg7kJlbe_cK3bD3Vhpwug";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly tokens: TokenService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  async register(input: RegisterInput): Promise<AuthTokens> {
    const existing = await this.prisma.client.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictError("A user with this email already exists");
    }

    const passwordHash = await hashPassword(input.password);
    // The tenant id is known up front so the RLS tenant claim can be set in
    // the same transaction as the tenant/membership inserts.
    const tenantId = newId();
    const tenantName =
      input.tenantName ?? `${input.email.split("@")[0]}'s team`;

    const { user } = await this.prisma.withRls(
      { [RLS_CONTEXT.TENANT]: tenantId },
      async (tx) => {
        const user = await tx.user.create({
          data: {
            email: input.email,
            name: input.name ?? null,
            passwordHash,
          },
        });

        await tx.tenant.create({
          data: { id: tenantId, name: tenantName, slug: newSlug(tenantName) },
        });

        await tx.membership.create({
          data: { tenantId, userId: user.id, role: "OWNER" },
        });

        return { user };
      },
    );

    await this.safeAudit({
      tenantId,
      actorType: "USER",
      actorId: user.id,
      action: "auth.register",
      targetType: "user",
      targetId: user.id,
      metadata: { email: user.email },
    });

    return this.issueTokens(user, tenantId);
  }

  async login(input: LoginInput): Promise<AuthTokens> {
    const user = await this.prisma.client.user.findUnique({
      where: { email: input.email },
    });

    const passwordOk = await verifyPassword(
      input.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || !passwordOk || !user.passwordHash) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const membership = await this.findPrimaryMembership(user.id);

    if (!membership) {
      throw new UnauthorizedError("No tenant membership for this account");
    }

    await this.safeAudit({
      tenantId: membership.tenantId,
      actorType: "USER",
      actorId: user.id,
      action: "auth.login",
      targetType: "user",
      targetId: user.id,
      metadata: { email: user.email },
    });

    return this.issueTokens(user, membership.tenantId);
  }

  async refresh(input: RefreshInput): Promise<AuthTokens> {
    const tokenHash = this.crypto.hash(input.refreshToken);

    const existing = await this.prisma.withRls(
      { [RLS_CONTEXT.REFRESH_TOKEN_HASH]: tokenHash },
      async (tx) =>
        tx.refreshToken.findUnique({
          where: { tokenHash },
          include: { user: true },
        }),
    );

    if (!existing) {
      throw new UnauthorizedError("Invalid refresh token");
    }

    if (existing.revokedAt) {
      // A rotated token was presented again: assume theft and revoke the
      // whole family for this user.
      await this.revokeAllForUser(existing.tenantId, existing.userId);
      throw new UnauthorizedError("Refresh token reuse detected");
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedError("Refresh token expired");
    }

    const { rawToken } = await this.prisma.withTenant(
      existing.tenantId,
      async (tx) => {
        const rawToken = this.crypto.randomToken(32);

        const created = await tx.refreshToken.create({
          data: {
            tenantId: existing.tenantId,
            userId: existing.userId,
            tokenHash: this.crypto.hash(rawToken),
            expiresAt: this.refreshExpiry(),
          },
        });

        await tx.refreshToken.update({
          where: { id: existing.id },
          data: { revokedAt: new Date(), replacedById: created.id },
        });

        return { rawToken };
      },
    );

    const access = this.tokens.signAccessToken({
      userId: existing.userId,
      tenantId: existing.tenantId,
    });

    return {
      accessToken: access.token,
      refreshToken: rawToken,
      tokenType: "Bearer",
      expiresIn: access.expiresIn,
    };
  }

  async logout(input: RefreshInput): Promise<{ success: true }> {
    const tokenHash = this.crypto.hash(input.refreshToken);

    const existing = await this.prisma.withRls(
      { [RLS_CONTEXT.REFRESH_TOKEN_HASH]: tokenHash },
      async (tx) =>
        tx.refreshToken.findUnique({
          where: { tokenHash },
          select: { id: true, tenantId: true, revokedAt: true },
        }),
    );

    if (existing && !existing.revokedAt) {
      await this.prisma.withTenant(existing.tenantId, async (tx) => {
        await tx.refreshToken.update({
          where: { id: existing.id },
          data: { revokedAt: new Date() },
        });
      });

      await this.safeAudit({
        tenantId: existing.tenantId,
        actorType: "USER",
        action: "auth.logout",
        targetType: "user",
        metadata: { refreshTokenId: existing.id },
      });
    }

    // Idempotent: logging out an unknown token is not an error.
    return { success: true };
  }

  async me(principal: UserPrincipal): Promise<Me> {
    const user = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: principal.userId },
    });

    return {
      user: toUser(user),
      tenantId: principal.tenantId,
      role: principal.role,
    };
  }

  private async findPrimaryMembership(
    userId: string,
  ): Promise<{ tenantId: string; role: MembershipRole } | null> {
    const membership = await this.prisma.withRls(
      { [RLS_CONTEXT.USER]: userId },
      async (tx) =>
        tx.membership.findFirst({
          where: { userId },
          orderBy: { createdAt: "asc" },
          select: { tenantId: true, role: true },
        }),
    );

    return membership;
  }

  private async issueTokens(
    user: UserRow,
    tenantId: string,
  ): Promise<AuthTokens> {
    const access = this.tokens.signAccessToken({
      userId: user.id,
      tenantId,
    });

    const refreshToken = this.crypto.randomToken(32);

    await this.prisma.withTenant(tenantId, async (tx) => {
      await tx.refreshToken.create({
        data: {
          tenantId,
          userId: user.id,
          tokenHash: this.crypto.hash(refreshToken),
          expiresAt: this.refreshExpiry(),
        },
      });
    });

    return {
      accessToken: access.token,
      refreshToken,
      tokenType: "Bearer",
      expiresIn: access.expiresIn,
    };
  }

  private async revokeAllForUser(
    tenantId: string,
    userId: string,
  ): Promise<void> {
    // Writes always need the tenant claim: RLS `WITH CHECK` is evaluated on
    // updated rows, so a user claim alone would be rejected (ADR-009).
    await this.prisma.withRls(
      {
        [RLS_CONTEXT.TENANT]: tenantId,
        [RLS_CONTEXT.USER]: userId,
      },
      async (tx) => {
        await tx.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      },
    );
  }

  private refreshExpiry(): Date {
    return new Date(Date.now() + this.tokens.refreshTtlSeconds * 1000);
  }

  private async safeAudit(
    input: Parameters<AuditService["record"]>[0],
  ): Promise<void> {
    if (!this.audit) {
      return;
    }

    try {
      await this.audit.record(input);
    } catch (error) {
      this.logger.warn(
        `auth audit failed for ${input.action}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
