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

import { Roles } from "../../common/decorators/roles.decorator.ts";
import { PaginationQueryDto } from "../../common/dto/pagination.dto.ts";
import { RemovedResponseDto } from "../../common/dto/responses.ts";
import {
  CreateMemberDto,
  MemberListResponseDto,
  type MemberView,
  MemberViewDto,
  UpdateMemberDto,
} from "./dto.ts";
import { MembersService } from "./members.service.ts";

@ApiTags("members")
@Controller({ path: "members", version: "1" })
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @ApiOperation({ summary: "List tenant members" })
  @ApiOkResponse({ type: MemberListResponseDto })
  list(
    @Query() query: PaginationQueryDto,
  ): Promise<{ data: MemberView[]; pagination: PaginationMeta }> {
    return this.members.list(query.page, query.limit);
  }

  @Roles("OWNER", "ADMIN")
  @Post()
  @ApiOperation({ summary: "Add a member to the tenant" })
  @ApiCreatedResponse({ type: MemberViewDto })
  create(@Body() dto: CreateMemberDto): Promise<MemberView> {
    return this.members.create(dto);
  }

  @Roles("OWNER", "ADMIN")
  @Patch(":id")
  @ApiOperation({ summary: "Update a member role" })
  @ApiOkResponse({ type: MemberViewDto })
  update(
    @Param("id") id: string,
    @Body() dto: UpdateMemberDto,
  ): Promise<MemberView> {
    return this.members.update(id, dto);
  }

  @Roles("OWNER", "ADMIN")
  @Delete(":id")
  @ApiOperation({ summary: "Remove a member" })
  @ApiOkResponse({ type: RemovedResponseDto })
  remove(@Param("id") id: string): Promise<{ removed: boolean }> {
    return this.members.remove(id);
  }
}
