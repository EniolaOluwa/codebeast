import { Controller, Get, Query } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { PaginationMeta } from "@repo/types";

import { TenantContext } from "../../common/context/tenant-context.ts";
import { Scopes } from "../../common/decorators/scopes.decorator.ts";
import { PaginationQueryDto } from "../../common/dto/pagination.dto.ts";
import { paginationMeta } from "../../common/pagination/pagination.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";
import { PullRequestListResponseDto } from "./dto.ts";

@ApiTags("pull-requests")
@Controller({ path: "pull-requests", version: "1" })
export class PullRequestsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  @Scopes("runs:read")
  @ApiOperation({ summary: "List pull requests opened by the pipeline" })
  @ApiOkResponse({ type: PullRequestListResponseDto })
  async list(
    @Query() query: PaginationQueryDto,
  ): Promise<{ data: unknown[]; pagination: PaginationMeta }> {
    const tenantId = this.tenantContext.requireTenantId();
    const { page, limit } = query;

    const result = await this.prisma.withTenantId(tenantId, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.pullRequest.findMany({
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
          include: { issue: { select: { id: true, title: true } } },
        }),
        tx.pullRequest.count(),
      ]);
      return { rows, total };
    });

    return {
      data: result.rows,
      pagination: paginationMeta(page, limit, result.total),
    };
  }
}
