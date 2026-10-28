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
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";

import {
  CurrentPrincipal,
  Roles,
  Scopes,
} from "../../common/auth/decorators.ts";
import type { UserPrincipal } from "../../common/auth/principal.ts";
import { Audit } from "../audit/audit.decorator.ts";
import {
  PaginationQueryDto,
  RepositoryCreateDto,
  RepositoryUpdateDto,
} from "./repositories.dto.ts";
import { RepositoriesService } from "./repositories.service.ts";

@ApiTags("repositories")
@ApiBearerAuth()
@Controller("repositories")
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class RepositoriesController {
  constructor(private readonly repositories: RepositoriesService) {}

  @Post()
  @Roles("OWNER", "ADMIN")
  @Scopes("repositories:write")
  @Audit("repository.create", { targetType: "repository" })
  @ApiOperation({ summary: "Register a repository for this tenant" })
  create(
    @CurrentPrincipal() principal: UserPrincipal,
    @Body() dto: RepositoryCreateDto,
  ) {
    return this.repositories.create(principal.tenantId, dto);
  }

  @Get()
  @Scopes("repositories:read")
  @ApiOperation({ summary: "List repositories" })
  list(
    @CurrentPrincipal() principal: UserPrincipal,
    @Query() query: PaginationQueryDto,
  ) {
    return this.repositories.list(principal.tenantId, query.page, query.limit);
  }

  @Get(":id")
  @Scopes("repositories:read")
  @ApiOperation({ summary: "Fetch one repository" })
  get(@CurrentPrincipal() principal: UserPrincipal, @Param("id") id: string) {
    return this.repositories.get(principal.tenantId, id);
  }

  @Patch(":id")
  @Roles("OWNER", "ADMIN")
  @Scopes("repositories:write")
  @Audit("repository.update", { targetType: "repository", targetParam: "id" })
  @ApiOperation({ summary: "Update a repository" })
  update(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param("id") id: string,
    @Body() dto: RepositoryUpdateDto,
  ) {
    return this.repositories.update(principal.tenantId, id, dto);
  }

  @Delete(":id")
  @Roles("OWNER", "ADMIN")
  @Scopes("repositories:write")
  @Audit("repository.remove", { targetType: "repository", targetParam: "id" })
  @ApiOperation({ summary: "Remove a repository" })
  remove(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param("id") id: string,
  ) {
    return this.repositories.remove(principal.tenantId, id);
  }
}
