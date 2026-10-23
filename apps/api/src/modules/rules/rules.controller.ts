import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";

import {
  CurrentPrincipal,
  Roles,
  Scopes,
} from "../../common/auth/decorators.ts";
import type { UserPrincipal } from "../../common/auth/principal.ts";
import { RuleEngine } from "./rule-engine.service.ts";
import { RuleCreateDto, RuleListQueryDto, RuleUpdateDto } from "./rules.dto.ts";
import { RulesService } from "./rules.service.ts";

@ApiTags("rules")
@Controller("rules")
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class RulesController {
  constructor(
    private readonly rules: RulesService,
    private readonly engine: RuleEngine,
  ) {}

  @Post()
  @Roles("OWNER", "ADMIN")
  @Scopes("rules:write")
  @ApiOperation({ summary: "Create a detection or automation rule" })
  create(
    @CurrentPrincipal() principal: UserPrincipal,
    @Body() dto: RuleCreateDto,
  ) {
    return this.rules.create(principal.tenantId, dto);
  }

  @Get()
  @Scopes("rules:read")
  @ApiOperation({ summary: "List rules (optionally by kind)" })
  list(
    @CurrentPrincipal() principal: UserPrincipal,
    @Query() query: RuleListQueryDto,
  ) {
    return this.rules.list(principal.tenantId, query.kind);
  }

  @Get(":id")
  @Scopes("rules:read")
  @ApiOperation({ summary: "Fetch one rule" })
  get(@CurrentPrincipal() principal: UserPrincipal, @Param("id") id: string) {
    return this.rules.get(principal.tenantId, id);
  }

  @Patch(":id")
  @Roles("OWNER", "ADMIN")
  @Scopes("rules:write")
  @ApiOperation({ summary: "Update or toggle a rule" })
  update(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param("id") id: string,
    @Body() dto: RuleUpdateDto,
  ) {
    return this.rules.update(principal.tenantId, id, dto);
  }

  @Delete(":id")
  @Roles("OWNER", "ADMIN")
  @Scopes("rules:write")
  @ApiOperation({ summary: "Delete a rule" })
  remove(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param("id") id: string,
  ) {
    return this.rules.remove(principal.tenantId, id);
  }

  @Post(":id/dry-run")
  @HttpCode(HttpStatus.OK)
  @Scopes("rules:read")
  @ApiOperation({
    summary: "Test a rule against the last 7 days of reports",
  })
  dryRun(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param("id") id: string,
  ) {
    return this.engine.dryRun(principal.tenantId, id);
  }
}
