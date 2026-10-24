import { Injectable } from "@nestjs/common";
import type { PaginationMeta } from "@repo/types";

import { TenantContext } from "../../common/context/tenant-context.ts";
import { NotFoundError } from "../../common/errors/errors.ts";
import { paginationMeta } from "../../common/pagination/pagination.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";
import type {
  CreateRepositoryDto,
  RepositoryView,
  UpdateRepositoryDto,
} from "./dto.ts";

@Injectable()
export class RepositoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async list(
    page: number,
    limit: number,
  ): Promise<{ data: RepositoryView[]; pagination: PaginationMeta }> {
    const result = await this.prisma.withTenant(async (tx) => {
      const [rows, total] = await Promise.all([
        tx.repository.findMany({
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        tx.repository.count(),
      ]);
      return { rows, total };
    });

    return {
      data: result.rows,
      pagination: paginationMeta(page, limit, result.total),
    };
  }

  async get(id: string): Promise<RepositoryView> {
    return this.prisma.withTenant(async (tx) => {
      const repo = await tx.repository.findUnique({ where: { id } });
      if (!repo) {
        throw new NotFoundError("Repository");
      }
      return repo;
    });
  }

  async create(dto: CreateRepositoryDto): Promise<RepositoryView> {
    const tenantId = this.tenantContext.requireTenantId();
    return this.prisma.withTenant((tx) =>
      tx.repository.create({
        data: {
          tenantId,
          provider: dto.provider,
          externalId: dto.externalId,
          fullName: dto.fullName,
          defaultBranch: dto.defaultBranch,
          installationId: dto.installationId,
        },
      }),
    );
  }

  async update(id: string, dto: UpdateRepositoryDto): Promise<RepositoryView> {
    return this.prisma.withTenant(async (tx) => {
      const existing = await tx.repository.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundError("Repository");
      }
      return tx.repository.update({ where: { id }, data: dto });
    });
  }

  async remove(id: string): Promise<{ removed: boolean }> {
    await this.prisma.withTenant(async (tx) => {
      const existing = await tx.repository.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundError("Repository");
      }
      await tx.repository.delete({ where: { id } });
    });
    return { removed: true };
  }

  /** Internal: resolve the repository an issue belongs to, within a tenant tx. */
  async resolveForTenant(): Promise<RepositoryView | null> {
    return this.prisma.withTenant((tx) =>
      tx.repository.findFirst({ where: { isActive: true } }),
    );
  }
}
