import { Injectable } from "@nestjs/common";
import type {
  PaginatedResponse,
  Repository,
  RepositoryCreateInput,
  RepositoryUpdateInput,
} from "@repo/types";

import { ConflictError, NotFoundError } from "../../common/errors/errors.ts";
import { paginated, skipTake } from "../../common/pagination.ts";
import { isUniqueViolation } from "../../common/prisma-errors.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";

interface RepositoryRow {
  id: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  githubRepoId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

function toRepository(row: RepositoryRow): Repository {
  return {
    id: row.id,
    name: row.name,
    fullName: row.fullName,
    defaultBranch: row.defaultBranch,
    githubRepoId: row.githubRepoId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const REPOSITORY_SELECT = {
  id: true,
  name: true,
  fullName: true,
  defaultBranch: true,
  githubRepoId: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class RepositoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    tenantId: string,
    input: RepositoryCreateInput,
  ): Promise<Repository> {
    try {
      const row = await this.prisma.withTenant(tenantId, (tx) =>
        tx.repository.create({
          data: {
            tenantId,
            name: input.name,
            fullName: input.fullName,
            defaultBranch: input.defaultBranch,
            githubRepoId: input.githubRepoId ?? null,
          },
          select: REPOSITORY_SELECT,
        }),
      );

      return toRepository(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("A repository with this name already exists");
      }
      throw error;
    }
  }

  async list(
    tenantId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<Repository>> {
    const { skip, take } = skipTake(page, limit);

    const [rows, total] = await this.prisma.withTenant(tenantId, (tx) =>
      Promise.all([
        tx.repository.findMany({
          where: { tenantId },
          orderBy: { createdAt: "asc" },
          skip,
          take,
          select: REPOSITORY_SELECT,
        }),
        tx.repository.count({ where: { tenantId } }),
      ]),
    );

    return paginated(rows.map(toRepository), page, limit, total);
  }

  async get(tenantId: string, id: string): Promise<Repository> {
    const row = await this.prisma.withTenant(tenantId, (tx) =>
      tx.repository.findFirst({
        where: { id, tenantId },
        select: REPOSITORY_SELECT,
      }),
    );

    if (!row) {
      throw new NotFoundError("Repository");
    }

    return toRepository(row);
  }

  async update(
    tenantId: string,
    id: string,
    input: RepositoryUpdateInput,
  ): Promise<Repository> {
    try {
      return await this.prisma.withTenant(tenantId, async (tx) => {
        const existing = await tx.repository.findFirst({
          where: { id, tenantId },
          select: { id: true },
        });

        if (!existing) {
          throw new NotFoundError("Repository");
        }

        const row = await tx.repository.update({
          where: { id: existing.id },
          data: {
            ...(input.name === undefined ? {} : { name: input.name }),
            ...(input.fullName === undefined
              ? {}
              : { fullName: input.fullName }),
            ...(input.defaultBranch === undefined
              ? {}
              : { defaultBranch: input.defaultBranch }),
            ...(input.githubRepoId === undefined
              ? {}
              : { githubRepoId: input.githubRepoId }),
          },
          select: REPOSITORY_SELECT,
        });

        return toRepository(row);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("A repository with this name already exists");
      }
      throw error;
    }
  }

  async remove(tenantId: string, id: string): Promise<{ success: true }> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const existing = await tx.repository.findFirst({
        where: { id, tenantId },
        select: { id: true },
      });

      if (!existing) {
        throw new NotFoundError("Repository");
      }

      await tx.repository.delete({ where: { id: existing.id } });
      return { success: true };
    });
  }
}
