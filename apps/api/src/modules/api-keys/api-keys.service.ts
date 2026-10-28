import { randomBytes } from "node:crypto";

import { Injectable } from "@nestjs/common";
import type {
  ApiKey,
  ApiKeyCreated,
  ApiKeyCreateInput,
  PaginatedResponse,
} from "@repo/types";

import { API_KEY_PREFIX } from "../../common/auth/principal.ts";
import { CryptoService } from "../../common/crypto/crypto.service.ts";
import { NotFoundError } from "../../common/errors/errors.ts";
import { paginated, skipTake } from "../../common/pagination.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";

interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

function toApiKey(row: ApiKeyRow): ApiKey {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: row.scopes as ApiKey["scopes"],
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  /**
   * The raw key is returned exactly once; only its sha256 hash is persisted.
   * Format: `cb_live_<prefix>_<secret>` (ADR-003).
   */
  async create(
    tenantId: string,
    input: ApiKeyCreateInput,
  ): Promise<ApiKeyCreated> {
    const prefix = `${API_KEY_PREFIX}${randomBytes(4).toString("hex")}`;
    const key = `${prefix}_${this.crypto.randomToken(32)}`;

    const row = await this.prisma.withTenant(tenantId, async (tx) =>
      tx.apiKey.create({
        data: {
          tenantId,
          name: input.name,
          prefix,
          keyHash: this.crypto.hash(key),
          scopes: input.scopes,
        },
      }),
    );

    return { ...toApiKey(row), key };
  }

  async list(
    tenantId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<ApiKey>> {
    const { skip, take } = skipTake(page, limit);

    const [rows, total] = await this.prisma.withTenant(tenantId, async (tx) =>
      Promise.all([
        tx.apiKey.findMany({
          where: { tenantId },
          orderBy: { createdAt: "desc" },
          skip,
          take,
          select: {
            id: true,
            name: true,
            prefix: true,
            scopes: true,
            lastUsedAt: true,
            revokedAt: true,
            createdAt: true,
          },
        }),
        tx.apiKey.count({ where: { tenantId } }),
      ]),
    );

    return paginated(rows.map(toApiKey), page, limit, total);
  }

  async revoke(tenantId: string, id: string): Promise<ApiKey> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const existing = await tx.apiKey.findFirst({
        where: { id, tenantId },
        select: { id: true, revokedAt: true },
      });

      if (!existing) {
        throw new NotFoundError("API key");
      }

      const row = await tx.apiKey.update({
        where: { id: existing.id },
        data: { revokedAt: existing.revokedAt ?? new Date() },
      });

      return toApiKey(row);
    });
  }
}
