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
  CreateIntegrationDto,
  IntegrationListResponseDto,
  type IntegrationView,
  IntegrationViewDto,
  UpdateIntegrationDto,
} from "./dto.ts";
import { IntegrationsService } from "./integrations.service.ts";

@ApiTags("integrations")
@Controller({ path: "integrations", version: "1" })
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  @Scopes("integrations:read")
  @ApiOperation({ summary: "List integrations" })
  @ApiOkResponse({ type: IntegrationListResponseDto })
  list(
    @Query() query: PaginationQueryDto,
  ): Promise<{ data: IntegrationView[]; pagination: PaginationMeta }> {
    return this.integrations.list(query.page, query.limit);
  }

  @Get(":id")
  @Scopes("integrations:read")
  @ApiOperation({ summary: "Get an integration" })
  @ApiOkResponse({ type: IntegrationViewDto })
  get(@Param("id") id: string): Promise<IntegrationView> {
    return this.integrations.get(id);
  }

  @Post()
  @Scopes("integrations:write")
  @ApiOperation({ summary: "Create an integration" })
  @ApiCreatedResponse({ type: IntegrationViewDto })
  create(@Body() dto: CreateIntegrationDto): Promise<IntegrationView> {
    return this.integrations.create(dto);
  }

  @Patch(":id")
  @Scopes("integrations:write")
  @ApiOperation({ summary: "Update an integration" })
  @ApiOkResponse({ type: IntegrationViewDto })
  update(
    @Param("id") id: string,
    @Body() dto: UpdateIntegrationDto,
  ): Promise<IntegrationView> {
    return this.integrations.update(id, dto);
  }

  @Delete(":id")
  @Scopes("integrations:write")
  @ApiOperation({ summary: "Delete an integration" })
  @ApiOkResponse({ type: RemovedResponseDto })
  remove(@Param("id") id: string): Promise<{ removed: boolean }> {
    return this.integrations.remove(id);
  }
}
