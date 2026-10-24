import { createHash, randomBytes } from "node:crypto";

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AuthSessionResponse, CurrentUser } from "@repo/types";

import { JwtService } from "../../common/auth/jwt.service.ts";
import { hashPassword, verifyPassword } from "../../common/auth/password.ts";
import {
  ConflictError,
  ForbiddenError,
  UnauthorizedError,
} from "../../common/errors/errors.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";
import type { LoginDto, RegisterDto } from "./dto.ts";

interface IssueInput {
  userId: string;
  email: string;
  name: string | null;
  tenantId: string;
  role: string;
  userAgent?: string;
  ip?: string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function slugify(value: string): string {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return base.length > 0 ? base : "tenant";
}

export interface RequestMeta {
  userAgent?: string;
  ip?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly refreshTtl: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.refreshTtl = config.getOrThrow<number>("JWT_REFRESH_TTL");
  }

  async register(
    dto: RegisterDto,
    meta: RequestMeta = {},
  ): Promise<AuthSessionResponse> {
    const email = dto.email.toLowerCase();

    const existing = await this.prisma.client.user.findUnique({
      where: { email },
    });
    if (existing) {
      throw new ConflictError("User");
    }

    const slug = `${slugify(dto.tenantName)}-${randomBytes(3).toString("hex")}`;

    const { user, tenant } = await this.prisma.client.$transaction(
      async (tx) => {
        const createdTenant = await tx.tenant.create({
          data: { name: dto.tenantName, slug },
        });
        const createdUser = await tx.user.create({
          data: {
            email,
            name: dto.name ?? null,
            passwordHash: hashPassword(dto.password),
          },
        });
        await tx.membership.create({
          data: {
            tenantId: createdTenant.id,
            userId: createdUser.id,
            role: "OWNER",
          },
        });
        return { user: createdUser, tenant: createdTenant };
      },
    );

    this.logger.log(`Registered tenant=${tenant.id} user=${user.id}`);
    return this.issueSession({
      userId: user.id,
      email: user.email,
      name: user.name,
      tenantId: tenant.id,
      role: "OWNER",
      userAgent: meta.userAgent,
      ip: meta.ip,
    });
  }

  async login(
    dto: LoginDto,
    meta: RequestMeta = {},
  ): Promise<AuthSessionResponse> {
    const email = dto.email.toLowerCase();
    const user = await this.prisma.client.user.findUnique({ where: { email } });

    if (
      !user?.passwordHash ||
      !verifyPassword(dto.password, user.passwordHash)
    ) {
      throw new UnauthorizedError("Invalid credentials");
    }

    const membership = await this.prisma.client.membership.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });

    if (!membership) {
      throw new ForbiddenError("User has no tenant membership");
    }

    return this.issueSession({
      userId: user.id,
      email: user.email,
      name: user.name,
      tenantId: membership.tenantId,
      role: membership.role,
      userAgent: meta.userAgent,
      ip: meta.ip,
    });
  }

  async refresh(refreshToken: string): Promise<AuthSessionResponse> {
    const tokenHash = hashToken(refreshToken);
    const record = await this.prisma.client.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (
      !record ||
      record.revokedAt !== null ||
      record.expiresAt.getTime() < Date.now()
    ) {
      throw new UnauthorizedError("Invalid refresh token");
    }

    const [user, membership] = await Promise.all([
      this.prisma.client.user.findUnique({ where: { id: record.userId } }),
      this.prisma.client.membership.findUnique({
        where: {
          tenantId_userId: {
            tenantId: record.tenantId,
            userId: record.userId,
          },
        },
      }),
    ]);

    if (!user || !membership) {
      throw new UnauthorizedError("Session no longer valid");
    }

    await this.prisma.client.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });

    return this.issueSession({
      userId: user.id,
      email: user.email,
      name: user.name,
      tenantId: membership.tenantId,
      role: membership.role,
    });
  }

  async logout(refreshToken: string): Promise<{ loggedOut: boolean }> {
    const tokenHash = hashToken(refreshToken);
    await this.prisma.client.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { loggedOut: true };
  }

  async me(userId: string, tenantId: string): Promise<CurrentUser> {
    const [user, membership] = await Promise.all([
      this.prisma.client.user.findUnique({ where: { id: userId } }),
      this.prisma.client.membership.findUnique({
        where: { tenantId_userId: { tenantId, userId } },
      }),
    ]);

    if (!user || !membership) {
      throw new UnauthorizedError("Session no longer valid");
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      tenantId,
      role: membership.role,
    };
  }

  private async issueSession(input: IssueInput): Promise<AuthSessionResponse> {
    const accessToken = this.jwt.sign({
      sub: input.userId,
      tid: input.tenantId,
      role: input.role,
    });

    const refreshToken = randomBytes(48).toString("base64url");
    await this.prisma.client.refreshToken.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + this.refreshTtl * 1000),
        userAgent: input.userAgent,
        ip: input.ip,
      },
    });

    return {
      user: {
        id: input.userId,
        email: input.email,
        name: input.name,
        tenantId: input.tenantId,
        role: input.role as CurrentUser["role"],
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: this.jwt.accessTtlSeconds,
      },
    };
  }
}
