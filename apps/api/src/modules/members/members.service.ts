import { Injectable } from "@nestjs/common";
import type { PaginationMeta } from "@repo/types";

import { TenantContext } from "../../common/context/tenant-context.ts";
import { ConflictError, NotFoundError } from "../../common/errors/errors.ts";
import { paginationMeta } from "../../common/pagination/pagination.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";
import type { CreateMemberDto, MemberView, UpdateMemberDto } from "./dto.ts";

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async list(
    page: number,
    limit: number,
  ): Promise<{ data: MemberView[]; pagination: PaginationMeta }> {
    const result = await this.prisma.withTenant(async (tx) => {
      const [rows, total] = await Promise.all([
        tx.membership.findMany({
          include: { user: true },
          orderBy: { createdAt: "asc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        tx.membership.count(),
      ]);

      return {
        rows,
        total,
      };
    });

    return {
      data: result.rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        email: row.user.email,
        name: row.user.name,
        role: row.role,
        createdAt: row.createdAt,
      })),
      pagination: paginationMeta(page, limit, result.total),
    };
  }

  async create(dto: CreateMemberDto): Promise<MemberView> {
    const email = dto.email.toLowerCase();
    const tenantId = this.tenantContext.requireTenantId();

    const user =
      (await this.prisma.client.user.findUnique({ where: { email } })) ??
      (await this.prisma.client.user.create({
        data: { email, name: dto.name ?? null },
      }));

    const membership = await this.prisma.withTenant(async (tx) => {
      const existing = await tx.membership.findUnique({
        where: { tenantId_userId: { tenantId, userId: user.id } },
      });
      if (existing) {
        throw new ConflictError("Member");
      }

      return tx.membership.create({
        data: { tenantId, userId: user.id, role: dto.role },
      });
    });

    return {
      id: membership.id,
      userId: user.id,
      email: user.email,
      name: user.name,
      role: membership.role,
      createdAt: membership.createdAt,
    };
  }

  async update(id: string, dto: UpdateMemberDto): Promise<MemberView> {
    const membership = await this.prisma.withTenant(async (tx) => {
      const existing = await tx.membership.findUnique({
        where: { id },
        include: { user: true },
      });
      if (!existing) {
        throw new NotFoundError("Member");
      }
      return tx.membership.update({
        where: { id },
        data: { role: dto.role },
        include: { user: true },
      });
    });

    return {
      id: membership.id,
      userId: membership.userId,
      email: membership.user.email,
      name: membership.user.name,
      role: membership.role,
      createdAt: membership.createdAt,
    };
  }

  async remove(id: string): Promise<{ removed: boolean }> {
    await this.prisma.withTenant(async (tx) => {
      const existing = await tx.membership.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundError("Member");
      }
      await tx.membership.delete({ where: { id } });
    });

    return { removed: true };
  }
}
