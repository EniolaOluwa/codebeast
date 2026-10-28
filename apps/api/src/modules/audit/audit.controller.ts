import { Controller, Get, Query } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import type { AuditLogListResponse } from "@repo/types";

import { CurrentPrincipal, Scopes } from "../../common/auth/decorators.ts";
import type { UserPrincipal } from "../../common/auth/principal.ts";
import { AuditService } from "./audit.service.ts";
import { AuditLogListQueryDto, AuditLogListResponseDto } from "./dto.ts";

@ApiTags("audit")
@ApiBearerAuth()
@Controller("audit-logs")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Scopes("audit:read")
  @ApiOperation({ summary: "List tenant audit log entries" })
  @ApiOkResponse({ type: AuditLogListResponseDto })
  list(
    @CurrentPrincipal() principal: UserPrincipal,
    @Query() query: AuditLogListQueryDto,
  ): Promise<AuditLogListResponse> {
    return this.audit.list(principal.tenantId, query);
  }
}
