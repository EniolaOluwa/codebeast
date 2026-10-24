import { Injectable } from "@nestjs/common";
import type { PaginationMeta } from "@repo/types";

import { TenantContext } from "../../common/context/tenant-context.ts";
import { NotFoundError } from "../../common/errors/errors.ts";
import { paginationMeta } from "../../common/pagination/pagination.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";
import type { ListIssuesQueryDto } from "../runs/dto.ts";
import { RunService } from "../runs/run.service.ts";

@Injectable()
export class IssuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly runService: RunService,
  ) {}

  async list(query: ListIssuesQueryDto): Promise<{
    data: unknown[];
    pagination: PaginationMeta;
  }> {
    const { page, limit, status, repositoryId, severity } = query;

    const result = await this.prisma.withTenant(async (tx) => {
      const where = {
        ...(status ? { status } : {}),
        ...(repositoryId ? { repositoryId } : {}),
        ...(severity ? { severity } : {}),
      };
      const [rows, total] = await Promise.all([
        tx.issue.findMany({
          where,
          orderBy: [{ severity: "desc" }, { lastSeenAt: "desc" }],
          skip: (page - 1) * limit,
          take: limit,
          include: { repository: true },
        }),
        tx.issue.count({ where }),
      ]);
      return { rows, total };
    });

    return {
      data: result.rows,
      pagination: paginationMeta(page, limit, result.total),
    };
  }

  async get(id: string): Promise<unknown> {
    return this.prisma.withTenant(async (tx) => {
      const issue = await tx.issue.findUnique({
        where: { id },
        include: {
          repository: true,
          signals: { orderBy: { occurredAt: "asc" } },
          runs: { orderBy: { createdAt: "desc" } },
          pullRequests: true,
        },
      });
      if (!issue) {
        throw new NotFoundError("Issue");
      }
      return issue;
    });
  }

  async retry(id: string): Promise<{ runId: string }> {
    const run = await this.runService.start(id);
    return { runId: run.id };
  }

  async ignore(id: string): Promise<{ status: "IGNORED" | "RESOLVED" }> {
    const tenantId = this.tenantContext.requireTenantId();
    await this.runService.setIssueStatus(tenantId, id, "IGNORED");
    return { status: "IGNORED" };
  }

  async approve(id: string): Promise<{ status: "IGNORED" | "RESOLVED" }> {
    const tenantId = this.tenantContext.requireTenantId();
    await this.runService.setIssueStatus(tenantId, id, "RESOLVED");
    return { status: "RESOLVED" };
  }
}
