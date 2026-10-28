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
  MemberInviteDto,
  MemberUpdateDto,
  PaginationQueryDto,
} from "./members.dto.ts";
import { MembersService } from "./members.service.ts";

@ApiTags("members")
@ApiBearerAuth()
@Controller("members")
@Roles("OWNER", "ADMIN", "MEMBER")
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @Scopes("members:read")
  @ApiOperation({ summary: "List tenant members" })
  list(
    @CurrentPrincipal() principal: UserPrincipal,
    @Query() query: PaginationQueryDto,
  ) {
    return this.members.list(principal.tenantId, query.page, query.limit);
  }

  @Post()
  @Roles("OWNER", "ADMIN")
  @Audit("member.invite", { targetType: "member" })
  @ApiOperation({ summary: "Add an existing account to the tenant" })
  invite(
    @CurrentPrincipal() principal: UserPrincipal,
    @Body() dto: MemberInviteDto,
  ) {
    return this.members.invite(principal.tenantId, dto);
  }

  @Patch(":id")
  @Roles("OWNER", "ADMIN")
  @Audit("member.update", { targetType: "member", targetParam: "id" })
  @ApiOperation({ summary: "Change a member's role" })
  updateRole(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param("id") id: string,
    @Body() dto: MemberUpdateDto,
  ) {
    return this.members.updateRole(principal.tenantId, id, dto);
  }

  @Delete(":id")
  @Roles("OWNER", "ADMIN")
  @Audit("member.remove", { targetType: "member", targetParam: "id" })
  @ApiOperation({ summary: "Remove a member (last owner is protected)" })
  remove(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param("id") id: string,
  ) {
    return this.members.remove(principal.tenantId, id, principal.userId);
  }
}
