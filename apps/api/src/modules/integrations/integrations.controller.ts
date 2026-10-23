import {
  Body,
  Controller,
  Delete,
  Get,
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
import {
  IntegrationCreateDto,
  IntegrationUpdateDto,
  PaginationQueryDto,
} from "./integrations.dto.ts";
import { IntegrationsService } from "./integrations.service.ts";

@ApiTags("integrations")
@Controller("integrations")
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Post()
  @Roles("OWNER", "ADMIN")
  @Scopes("integrations:write")
  @ApiOperation({
    summary: "Connect a provider (secrets are encrypted at rest)",
  })
  create(
    @CurrentPrincipal() principal: UserPrincipal,
    @Body() dto: IntegrationCreateDto,
  ) {
    return this.integrations.create(principal.tenantId, dto);
  }

  @Get()
  @Scopes("integrations:read")
  @ApiOperation({ summary: "List integrations (secrets never returned)" })
  list(
    @CurrentPrincipal() principal: UserPrincipal,
    @Query() query: PaginationQueryDto,
  ) {
    return this.integrations.list(principal.tenantId, query.page, query.limit);
  }

  @Get(":id")
  @Scopes("integrations:read")
  @ApiOperation({ summary: "Fetch one integration" })
  get(@CurrentPrincipal() principal: UserPrincipal, @Param("id") id: string) {
    return this.integrations.get(principal.tenantId, id);
  }

  @Patch(":id")
  @Roles("OWNER", "ADMIN")
  @Scopes("integrations:write")
  @ApiOperation({ summary: "Update an integration" })
  update(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param("id") id: string,
    @Body() dto: IntegrationUpdateDto,
  ) {
    return this.integrations.update(principal.tenantId, id, dto);
  }

  @Delete(":id")
  @Roles("OWNER", "ADMIN")
  @Scopes("integrations:write")
  @ApiOperation({ summary: "Disconnect an integration" })
  remove(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param("id") id: string,
  ) {
    return this.integrations.remove(principal.tenantId, id);
  }
}
