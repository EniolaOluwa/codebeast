import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

import { TenantContext } from "../../common/context/tenant-context.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";
import { TenantViewDto } from "./dto.ts";

@ApiTags("tenants")
@Controller({ path: "tenants", version: "1" })
export class TenantsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get("current")
  @ApiOperation({ summary: "Get the caller's tenant" })
  @ApiOkResponse({ type: TenantViewDto })
  current(): Promise<{
    id: string;
    name: string;
    slug: string;
    plan: string;
    createdAt: Date;
  }> {
    const tenantId = this.tenantContext.requireTenantId();
    return this.prisma.withTenant((tx) =>
      tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: {
          id: true,
          name: true,
          slug: true,
          plan: true,
          createdAt: true,
        },
      }),
    );
  }
}
