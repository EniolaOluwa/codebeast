import { Controller, Get } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";

import { CurrentPrincipal, Scopes } from "../../common/auth/decorators.ts";
import type { UserPrincipal } from "../../common/auth/principal.ts";
import { OverviewService } from "./overview.service.ts";

@ApiTags("overview")
@ApiBearerAuth()
@Controller("overview")
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class OverviewController {
  constructor(private readonly overview: OverviewService) {}

  @Get()
  @Scopes("overview:read")
  @ApiOperation({
    summary: "Pipeline health: counts, needs-review list, source health",
  })
  get(@CurrentPrincipal() principal: UserPrincipal) {
    return this.overview.get(principal.tenantId);
  }
}
