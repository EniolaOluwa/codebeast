import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";

import { CurrentPrincipal, Roles } from "../../common/auth/decorators.ts";
import type { UserPrincipal } from "../../common/auth/principal.ts";
import {
  ApiKeyCreatedDto,
  ApiKeyCreateDto,
  PaginationQueryDto,
} from "./api-keys.dto.ts";
import { ApiKeysService } from "./api-keys.service.ts";

@ApiTags("api-keys")
@Controller("api-keys")
@Roles("OWNER", "ADMIN")
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Post()
  @ApiOperation({ summary: "Create an API key (raw value returned once)" })
  @ApiOkResponse({ type: ApiKeyCreatedDto })
  create(
    @CurrentPrincipal() principal: UserPrincipal,
    @Body() dto: ApiKeyCreateDto,
  ): Promise<ApiKeyCreatedDto> {
    return this.apiKeys.create(principal.tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: "List API keys for the tenant" })
  list(
    @CurrentPrincipal() principal: UserPrincipal,
    @Query() query: PaginationQueryDto,
  ) {
    return this.apiKeys.list(principal.tenantId, query.page, query.limit);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Revoke an API key" })
  revoke(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param("id") id: string,
  ) {
    return this.apiKeys.revoke(principal.tenantId, id);
  }
}
