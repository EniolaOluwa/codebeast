import { Injectable } from "@nestjs/common";
import type { Prisma } from "@repo/db";
import type { PaginationMeta } from "@repo/types";

import { TenantContext } from "../../common/context/tenant-context.ts";
import { CryptoService } from "../../common/crypto/crypto.service.ts";
import { NotFoundError } from "../../common/errors/errors.ts";
import { paginationMeta } from "../../common/pagination/pagination.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";
import type {
  CreateIntegrationDto,
  IntegrationView,
  IntegrationWithSecret,
  UpdateIntegrationDto,
} from "./dto.ts";

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly tenantContext: TenantContext,
  ) {}

  async list(
    page: number,
    limit: number,
  ): Promise<{ data: IntegrationView[]; pagination: PaginationMeta }> {
    const result = await this.prisma.withTenant(async (tx) => {
      const [rows, total] = await Promise.all([
        tx.integration.findMany({
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        tx.integration.count(),
      ]);
      return { rows, total };
    });

    return {
      data: result.rows.map((row) => this.toView(row)),
      pagination: paginationMeta(page, limit, result.total),
    };
  }

  async get(id: string): Promise<IntegrationView> {
    return this.prisma.withTenant(async (tx) => {
      const row = await tx.integration.findUnique({ where: { id } });
      if (!row) {
        throw new NotFoundError("Integration");
      }
      return this.toView(row);
    });
  }

  async create(dto: CreateIntegrationDto): Promise<IntegrationView> {
    const tenantId = this.tenantContext.requireTenantId();
    const row = await this.prisma.withTenant((tx) =>
      tx.integration.create({
        data: {
          tenantId,
          type: dto.type,
          name: dto.name,
          config: dto.config as Prisma.InputJsonValue,
          repositoryId: dto.repositoryId,
          externalAccountId: dto.externalAccountId,
          secretEncrypted: dto.secret
            ? this.crypto.encrypt(dto.secret)
            : undefined,
        },
      }),
    );
    return this.toView(row);
  }

  async update(
    id: string,
    dto: UpdateIntegrationDto,
  ): Promise<IntegrationView> {
    const row = await this.prisma.withTenant(async (tx) => {
      const existing = await tx.integration.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundError("Integration");
      }

      return tx.integration.update({
        where: { id },
        data: {
          name: dto.name,
          config: dto.config as Prisma.InputJsonValue | undefined,
          status: dto.status,
          repositoryId: dto.repositoryId,
          secretEncrypted:
            dto.secret === undefined
              ? undefined
              : dto.secret === null
                ? null
                : this.crypto.encrypt(dto.secret),
        },
      });
    });
    return this.toView(row);
  }

  async remove(id: string): Promise<{ removed: boolean }> {
    await this.prisma.withTenant(async (tx) => {
      const existing = await tx.integration.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundError("Integration");
      }
      await tx.integration.delete({ where: { id } });
    });
    return { removed: true };
  }

  /**
   * Internal: resolve an integration and its decrypted webhook secret by id.
   * Webhook handling resolves the tenant from the integration, so this runs
   * before a tenant context exists and uses the unscoped client.
   */
  async resolveWithSecret(id: string): Promise<IntegrationWithSecret | null> {
    const row = await this.prisma.client.integration.findUnique({
      where: { id },
    });
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      tenantId: row.tenantId,
      type: row.type,
      repositoryId: row.repositoryId,
      secret: row.secretEncrypted
        ? this.crypto.decrypt(row.secretEncrypted)
        : null,
    };
  }

  private toView(row: {
    id: string;
    type: string;
    status: string;
    name: string;
    config: unknown;
    externalAccountId: string | null;
    repositoryId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): IntegrationView {
    return {
      id: row.id,
      type: row.type,
      status: row.status,
      name: row.name,
      config: row.config,
      externalAccountId: row.externalAccountId,
      repositoryId: row.repositoryId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
