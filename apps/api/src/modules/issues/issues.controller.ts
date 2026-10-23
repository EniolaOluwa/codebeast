import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";

import { CurrentPrincipal, Scopes } from "../../common/auth/decorators.ts";
import type { UserPrincipal } from "../../common/auth/principal.ts";
import { TriageService } from "../triage/triage.service.ts";
import { IssueListQueryDto } from "./issues.dto.ts";
import { IssuesService } from "./issues.service.ts";

@ApiTags("issues")
@Controller("issues")
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class IssuesController {
  constructor(
    private readonly issues: IssuesService,
    private readonly triage: TriageService,
  ) {}

  @Get()
  @Scopes("issues:read")
  @ApiOperation({ summary: "List triaged issues" })
  list(
    @CurrentPrincipal() principal: UserPrincipal,
    @Query() query: IssueListQueryDto,
  ) {
    return this.issues.list(
      principal.tenantId,
      query.page,
      query.limit,
      query.status,
    );
  }

  @Get(":id")
  @Scopes("issues:read")
  @ApiOperation({ summary: "Issue detail with its signals" })
  get(@CurrentPrincipal() principal: UserPrincipal, @Param("id") id: string) {
    return this.issues.get(principal.tenantId, id);
  }

  @Get(":id/context")
  @Scopes("issues:read")
  @ApiOperation({
    summary:
      "Bounded agent context for this issue (cached; enrichment runs once)",
  })
  context(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param("id") id: string,
  ) {
    return this.triage.buildIssueContext(principal.tenantId, id);
  }
}
