import { Injectable } from "@nestjs/common";
import type {
  Integration,
  IntegrationCreateInput,
  IntegrationUpdateInput,
  PaginatedResponse,
} from "@repo/types";

import { CryptoService } from "../../common/crypto/crypto.service.ts";
import { ConflictError, NotFoundError } from "../../common/errors/errors.ts";
import { paginated, skipTake } from "../../common/pagination.ts";
import { isUniqueViolation } from "../../common/prisma-errors.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";

export interface IntegrationRow {
  id: string;
  tenantId: string;
  type: Integration["type"];
  name: string;
  externalId: string | null;
  config: unknown;
  secrets: string | null;
  enabled: boolean;
  repositoryId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toIntegration(row: IntegrationRow): Integration {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    externalId: row.externalId,
    config: (row.config ?? {}) as Record<string, unknown>,
    enabled: row.enabled,
    repositoryId: row.repositoryId,
    hasSecrets: row.secrets !== null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async create(
    tenantId: string,
    input: IntegrationCreateInput,
  ): Promise<Integration> {
    try {
      const row = await this.prisma.withTenant(tenantId, (tx) =>
        tx.integration.create({
          data: {
            tenantId,
            type: input.type,
            name: input.name,
            externalId: input.externalId ?? null,
            config: (input.config ?? {}) as object,
            secrets: input.secrets
              ? this.crypto.encrypt(JSON.stringify(input.secrets))
              : null,
            enabled: input.enabled ?? true,
            repositoryId: input.repositoryId ?? null,
          },
        }),
      );

      return toIntegration(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError(
          "An integration with this name or external id already exists",
        );
      }
      throw error;
    }
  }

  async list(
    tenantId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<Integration>> {
    const { skip, take } = skipTake(page, limit);

    const [rows, total] = await this.prisma.withTenant(tenantId, (tx) =>
      Promise.all([
        tx.integration.findMany({
          where: { tenantId },
          orderBy: { createdAt: "asc" },
          skip,
          take,
        }),
        tx.integration.count({ where: { tenantId } }),
      ]),
    );

    return paginated(rows.map(toIntegration), page, limit, total);
  }

  async get(tenantId: string, id: string): Promise<Integration> {
    const row = await this.prisma.withTenant(tenantId, (tx) =>
      tx.integration.findFirst({ where: { id, tenantId } }),
    );

    if (!row) {
      throw new NotFoundError("Integration");
    }

    return toIntegration(row);
  }

  async update(
    tenantId: string,
    id: string,
    input: IntegrationUpdateInput,
  ): Promise<Integration> {
    try {
      return await this.prisma.withTenant(tenantId, async (tx) => {
        const existing = await tx.integration.findFirst({
          where: { id, tenantId },
          select: { id: true },
        });

        if (!existing) {
          throw new NotFoundError("Integration");
        }

        const row = await tx.integration.update({
          where: { id: existing.id },
          data: {
            ...(input.name === undefined ? {} : { name: input.name }),
            ...(input.externalId === undefined
              ? {}
              : { externalId: input.externalId }),
            ...(input.config === undefined
              ? {}
              : { config: input.config as object }),
            ...(input.secrets === undefined
              ? {}
              : {
                  secrets: input.secrets
                    ? this.crypto.encrypt(JSON.stringify(input.secrets))
                    : null,
                }),
            ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
            ...(input.repositoryId === undefined
              ? {}
              : { repositoryId: input.repositoryId }),
          },
        });

        return toIntegration(row);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError(
          "An integration with this name or external id already exists",
        );
      }
      throw error;
    }
  }

  async remove(tenantId: string, id: string): Promise<{ success: true }> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const existing = await tx.integration.findFirst({
        where: { id, tenantId },
        select: { id: true },
      });

      if (!existing) {
        throw new NotFoundError("Integration");
      }

      await tx.integration.delete({ where: { id: existing.id } });
      return { success: true };
    });
  }

  /** Decrypts the stored secret bag for a resolved integration row. */
  getSecrets(row: { secrets: string | null }): Record<string, string> {
    if (!row.secrets) {
      return {};
    }

    const parsed: unknown = JSON.parse(this.crypto.decrypt(row.secrets));

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return {};
    }

    return parsed as Record<string, string>;
  }
}
