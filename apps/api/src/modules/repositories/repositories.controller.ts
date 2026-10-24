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
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import type { PaginationMeta } from "@repo/types";

import { Scopes } from "../../common/decorators/scopes.decorator.ts";
import { PaginationQueryDto } from "../../common/dto/pagination.dto.ts";
import { RemovedResponseDto } from "../../common/dto/responses.ts";
import {
  CreateRepositoryDto,
  RepositoryListResponseDto,
  type RepositoryView,
  RepositoryViewDto,
  UpdateRepositoryDto,
} from "./dto.ts";
import { RepositoriesService } from "./repositories.service.ts";

@ApiTags("repositories")
@Controller({ path: "repositories", version: "1" })
export class RepositoriesController {
  constructor(private readonly repositories: RepositoriesService) {}

  @Get()
  @Scopes("repositories:read")
  @ApiOperation({ summary: "List connected repositories" })
  @ApiOkResponse({ type: RepositoryListResponseDto })
  list(
    @Query() query: PaginationQueryDto,
  ): Promise<{ data: RepositoryView[]; pagination: PaginationMeta }> {
    return this.repositories.list(query.page, query.limit);
  }

  @Get(":id")
  @Scopes("repositories:read")
  @ApiOperation({ summary: "Get a repository" })
  @ApiOkResponse({ type: RepositoryViewDto })
  get(@Param("id") id: string): Promise<RepositoryView> {
    return this.repositories.get(id);
  }

  @Post()
  @Scopes("repositories:write")
  @ApiOperation({ summary: "Connect a repository" })
  @ApiCreatedResponse({ type: RepositoryViewDto })
  create(@Body() dto: CreateRepositoryDto): Promise<RepositoryView> {
    return this.repositories.create(dto);
  }

  @Patch(":id")
  @Scopes("repositories:write")
  @ApiOperation({ summary: "Update a repository" })
  @ApiOkResponse({ type: RepositoryViewDto })
  update(
    @Param("id") id: string,
    @Body() dto: UpdateRepositoryDto,
  ): Promise<RepositoryView> {
    return this.repositories.update(id, dto);
  }

  @Delete(":id")
  @Scopes("repositories:write")
  @ApiOperation({ summary: "Disconnect a repository" })
  @ApiOkResponse({ type: RemovedResponseDto })
  remove(@Param("id") id: string): Promise<{ removed: boolean }> {
    return this.repositories.remove(id);
  }
}
