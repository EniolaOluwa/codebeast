import { Injectable } from "@nestjs/common";
import type { Prisma } from "@repo/db";
import type {
  MemberInviteInput,
  MembershipRole,
  MemberUpdateInput,
} from "@repo/types";

import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../common/errors/errors.ts";
import { paginated, skipTake } from "../../common/pagination.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";

export interface MemberView {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  role: MembershipRole;
  createdAt: string;
}

interface MemberRow {
  id: string;
  userId: string;
  role: MembershipRole;
  createdAt: Date;
  user: { email: string; name: string | null };
}

function toMember(row: MemberRow): MemberView {
  return {
    id: row.id,
    userId: row.userId,
    email: row.user.email,
    name: row.user.name,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, page: number, limit: number) {
    const { skip, take } = skipTake(page, limit);

    const [rows, total] = await this.prisma.withTenant(tenantId, (tx) =>
      Promise.all([
        tx.membership.findMany({
          where: { tenantId },
          orderBy: { createdAt: "asc" },
          skip,
          take,
          include: { user: { select: { email: true, name: true } } },
        }),
        tx.membership.count({ where: { tenantId } }),
      ]),
    );

    return paginated(
      rows.map((row) => toMember(row)),
      page,
      limit,
      total,
    );
  }

  /** Invitations are limited to accounts that already exist (they register first). */
  async invite(
    tenantId: string,
    input: MemberInviteInput,
  ): Promise<MemberView> {
    const user = await this.prisma.client.user.findUnique({
      where: { email: input.email },
      select: { id: true, email: true, name: true },
    });

    if (!user) {
      throw new ValidationError(
        "No account exists for this email — ask them to register first",
      );
    }

    try {
      const row = await this.prisma.withTenant(tenantId, (tx) =>
        tx.membership.create({
          data: { tenantId, userId: user.id, role: input.role },
          include: { user: { select: { email: true, name: true } } },
        }),
      );

      return toMember(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("This user is already a member");
      }
      throw error;
    }
  }

  async updateRole(
    tenantId: string,
    membershipId: string,
    input: MemberUpdateInput,
  ): Promise<MemberView> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const target = await tx.membership.findFirst({
        where: { id: membershipId, tenantId },
        include: { user: { select: { email: true, name: true } } },
      });

      if (!target) {
        throw new NotFoundError("Member");
      }

      if (target.role === "OWNER" && input.role !== "OWNER") {
        await this.assertAnotherOwnerRemains(tx, tenantId, target.id);
      }

      const updated = await tx.membership.update({
        where: { id: target.id },
        data: { role: input.role },
        include: { user: { select: { email: true, name: true } } },
      });

      return toMember(updated);
    });
  }

  async remove(
    tenantId: string,
    membershipId: string,
    actingUserId: string,
  ): Promise<{ success: true }> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const target = await tx.membership.findFirst({
        where: { id: membershipId, tenantId },
        select: { id: true, userId: true, role: true },
      });

      if (!target) {
        throw new NotFoundError("Member");
      }

      if (target.userId === actingUserId) {
        throw new ValidationError("Members cannot remove themselves");
      }

      if (target.role === "OWNER") {
        await this.assertAnotherOwnerRemains(tx, tenantId, target.id);
      }

      await tx.membership.delete({ where: { id: target.id } });
      return { success: true };
    });
  }

  private async assertAnotherOwnerRemains(
    tx: Prisma.TransactionClient,
    tenantId: string,
    excludingMembershipId: string,
  ): Promise<void> {
    const owners = await tx.membership.count({
      where: {
        tenantId,
        role: "OWNER",
        id: { not: excludingMembershipId },
      },
    });

    if (owners === 0) {
      throw new ValidationError("The last owner cannot be removed or demoted");
    }
  }
}
