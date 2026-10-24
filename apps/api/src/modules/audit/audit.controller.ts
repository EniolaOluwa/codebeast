import { Controller, Get, Query } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { PaginationMeta } from "@repo/types";

import { Scopes } from "../../common/decorators/scopes.decorator.ts";
import { PaginationQueryDto } from "../../common/dto/pagination.dto.ts";
import { paginationMeta } from "../../common/pagination/pagination.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";
import { AuditLogListResponseDto } from "./dto.ts";

@ApiTags("audit")
@Controller({ path: "audit-logs", version: "1" })
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Scopes("audit:read")
  @ApiOperation({ summary: "List tenant audit log entries" })
  @ApiOkResponse({ type: AuditLogListResponseDto })
  async list(
    @Query() query: PaginationQueryDto,
  ): Promise<{ data: unknown[]; pagination: PaginationMeta }> {
    const { page, limit } = query;

    const result = await this.prisma.withTenant(async (tx) => {
      const [rows, total] = await Promise.all([
        tx.auditLog.findMany({
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        tx.auditLog.count(),
      ]);
      return { rows, total };
    });

    return {
      data: result.rows,
      pagination: paginationMeta(page, limit, result.total),
    };
  }
}
