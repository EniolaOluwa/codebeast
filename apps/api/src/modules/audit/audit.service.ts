import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@repo/db";
import type {
  ActorType,
  AuditLogListQuery,
  AuditLogView,
  PaginatedResponse,
} from "@repo/types";

import { paginated } from "../../common/pagination.ts";
import { TenantContextService } from "../../common/tenant-context/tenant-context.service.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";

export interface RecordAuditInput {
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: unknown;
  actorType?: ActorType;
  actorId?: string | null;
  tenantId?: string;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Writes and lists tenant audit log rows. Recording is best-effort: callers
 * should catch failures so a logging outage never fails the primary request.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async record(input: RecordAuditInput): Promise<void> {
    const ambient = this.tenantContext.get();
    const tenantId = input.tenantId ?? ambient?.tenantId;

    if (!tenantId) {
      this.logger.warn(`audit skipped (no tenant): ${input.action}`);
      return;
    }

    const actor = this.resolveActor(input, ambient);

    await this.prisma.withTenant(tenantId, async (tx) => {
      await tx.auditLog.create({
        data: {
          tenantId,
          actorType: actor.actorType,
          actorId: actor.actorId,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId ?? null,
          metadata: (input.metadata ?? null) as Prisma.InputJsonValue,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
        },
      });
    });
  }

  /**
   * System / automation events that have no request ambient context.
   */
  async recordSystem(
    input: Omit<RecordAuditInput, "actorType" | "actorId"> & {
      tenantId: string;
    },
  ): Promise<void> {
    try {
      await this.record({
        ...input,
        actorType: "SYSTEM",
        actorId: null,
      });
    } catch (error) {
      this.logger.warn(
        `system audit failed for ${input.action}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async list(
    tenantId: string,
    query: AuditLogListQuery,
  ): Promise<PaginatedResponse<AuditLogView>> {
    const { page, limit } = query;

    const where: Prisma.AuditLogWhereInput = {
      tenantId,
      ...(query.actorType ? { actorType: query.actorType } : {}),
      ...(query.action ? { action: { startsWith: query.action } } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.targetId ? { targetId: query.targetId } : {}),
      ...((query.from || query.to) && {
        createdAt: {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          ...(query.to ? { lte: new Date(query.to) } : {}),
        },
      }),
    };

    const result = await this.prisma.withTenant(tenantId, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.auditLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        tx.auditLog.count({ where }),
      ]);
      return { rows, total };
    });

    return paginated(
      result.rows.map((row) => ({
        id: row.id,
        tenantId: row.tenantId,
        actorType: row.actorType,
        actorId: row.actorId,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        metadata: row.metadata,
        ip: row.ip,
        userAgent: row.userAgent,
        createdAt: row.createdAt.toISOString(),
      })),
      page,
      limit,
      result.total,
    );
  }

  private resolveActor(
    input: RecordAuditInput,
    ambient:
      { tenantId: string; userId?: string; apiKeyId?: string } | undefined,
  ): { actorType: ActorType; actorId: string | null } {
    if (input.actorType) {
      return {
        actorType: input.actorType,
        actorId: input.actorId ?? null,
      };
    }

    if (ambient?.userId) {
      return { actorType: "USER", actorId: ambient.userId };
    }

    if (ambient?.apiKeyId) {
      return { actorType: "API_KEY", actorId: ambient.apiKeyId };
    }

    return { actorType: "SYSTEM", actorId: null };
  }
}
