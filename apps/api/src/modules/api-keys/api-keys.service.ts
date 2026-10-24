import { Injectable } from "@nestjs/common";
import type { PaginationMeta } from "@repo/types";

import { generateApiKey } from "../../common/auth/api-key.ts";
import { TenantContext } from "../../common/context/tenant-context.ts";
import { NotFoundError } from "../../common/errors/errors.ts";
import { paginationMeta } from "../../common/pagination/pagination.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";
import type { ApiKeyView, CreateApiKeyDto, CreatedApiKeyView } from "./dto.ts";

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async list(
    page: number,
    limit: number,
  ): Promise<{ data: ApiKeyView[]; pagination: PaginationMeta }> {
    const result = await this.prisma.withTenant(async (tx) => {
      const [rows, total] = await Promise.all([
        tx.apiKey.findMany({
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        tx.apiKey.count(),
      ]);
      return { rows, total };
    });

    return {
      data: result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        prefix: row.prefix,
        scopes: row.scopes,
        lastUsedAt: row.lastUsedAt,
        expiresAt: row.expiresAt,
        revokedAt: row.revokedAt,
        createdAt: row.createdAt,
      })),
      pagination: paginationMeta(page, limit, result.total),
    };
  }

  async create(dto: CreateApiKeyDto): Promise<CreatedApiKeyView> {
    const tenantId = this.tenantContext.requireTenantId();
    const generated = generateApiKey();

    const record = await this.prisma.withTenant((tx) =>
      tx.apiKey.create({
        data: {
          tenantId,
          name: dto.name,
          prefix: generated.prefix,
          keyHash: generated.keyHash,
          scopes: dto.scopes,
          expiresAt: dto.expiresAt,
          createdById:
            this.tenantContext.get()?.actorType === "USER"
              ? this.tenantContext.get()?.actorId
              : undefined,
        },
      }),
    );

    return {
      id: record.id,
      name: record.name,
      prefix: record.prefix,
      scopes: record.scopes,
      lastUsedAt: record.lastUsedAt,
      expiresAt: record.expiresAt,
      revokedAt: record.revokedAt,
      createdAt: record.createdAt,
      key: generated.fullKey,
    };
  }

  async revoke(id: string): Promise<ApiKeyView> {
    const record = await this.prisma.withTenant(async (tx) => {
      const existing = await tx.apiKey.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundError("API key");
      }
      return tx.apiKey.update({
        where: { id },
        data: { revokedAt: existing.revokedAt ?? new Date() },
      });
    });

    return {
      id: record.id,
      name: record.name,
      prefix: record.prefix,
      scopes: record.scopes,
      lastUsedAt: record.lastUsedAt,
      expiresAt: record.expiresAt,
      revokedAt: record.revokedAt,
      createdAt: record.createdAt,
    };
  }
}
