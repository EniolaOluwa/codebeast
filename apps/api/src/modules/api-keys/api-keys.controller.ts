import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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

import { Roles } from "../../common/decorators/roles.decorator.ts";
import { PaginationQueryDto } from "../../common/dto/pagination.dto.ts";
import { ApiKeysService } from "./api-keys.service.ts";
import {
  ApiKeyListResponseDto,
  type ApiKeyView,
  ApiKeyViewDto,
  CreateApiKeyDto,
  type CreatedApiKeyView,
  CreatedApiKeyViewDto,
} from "./dto.ts";

@ApiTags("api-keys")
@Roles("OWNER", "ADMIN")
@Controller({ path: "api-keys", version: "1" })
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  @ApiOperation({ summary: "List API keys (hashes never returned)" })
  @ApiOkResponse({ type: ApiKeyListResponseDto })
  list(
    @Query() query: PaginationQueryDto,
  ): Promise<{ data: ApiKeyView[]; pagination: PaginationMeta }> {
    return this.apiKeys.list(query.page, query.limit);
  }

  @Post()
  @ApiOperation({ summary: "Create an API key (plaintext returned once)" })
  @ApiCreatedResponse({ type: CreatedApiKeyViewDto })
  create(@Body() dto: CreateApiKeyDto): Promise<CreatedApiKeyView> {
    return this.apiKeys.create(dto);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Revoke an API key" })
  @ApiOkResponse({ type: ApiKeyViewDto })
  revoke(@Param("id") id: string): Promise<ApiKeyView> {
    return this.apiKeys.revoke(id);
  }
}
