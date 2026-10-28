import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";

import { CurrentPrincipal, Scopes } from "../../common/auth/decorators.ts";
import type { UserPrincipal } from "../../common/auth/principal.ts";
import { RunListQueryDto } from "./runs.dto.ts";
import { RunsService } from "./runs.service.ts";

@ApiTags("runs")
@Controller("runs")
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class RunsController {
  constructor(private readonly runs: RunsService) {}

  @Get()
  @Scopes("runs:read")
  @ApiOperation({ summary: "List runs (filter by issue or status)" })
  list(
    @CurrentPrincipal() principal: UserPrincipal,
    @Query() query: RunListQueryDto,
  ) {
    return this.runs.list(principal.tenantId, query.page, query.limit, {
      ...(query.issueId ? { issueId: query.issueId } : {}),
      ...(query.status ? { status: query.status } : {}),
    });
  }

  @Get(":id")
  @Scopes("runs:read")
  @ApiOperation({
    summary: "Run detail: plans, patches, validations and the PR",
  })
  get(@CurrentPrincipal() principal: UserPrincipal, @Param("id") id: string) {
    return this.runs.get(principal.tenantId, id);
  }
}
