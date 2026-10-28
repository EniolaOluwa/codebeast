import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";

import { CurrentPrincipal, Scopes } from "../../common/auth/decorators.ts";
import type { UserPrincipal } from "../../common/auth/principal.ts";
import { Audit } from "../audit/audit.decorator.ts";
import { TriageService } from "../triage/triage.service.ts";
import { IssueListQueryDto } from "./issues.dto.ts";
import { IssuesService } from "./issues.service.ts";

@ApiTags("issues")
@ApiBearerAuth()
@Controller("issues")
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class IssuesController {
  constructor(
    private readonly issues: IssuesService,
    private readonly triage: TriageService,
  ) {}

  @Get()
  @Scopes("issues:read")
  @ApiOperation({ summary: "List triaged issues" })
  list(
    @CurrentPrincipal() principal: UserPrincipal,
    @Query() query: IssueListQueryDto,
  ) {
    return this.issues.list(
      principal.tenantId,
      query.page,
      query.limit,
      query.status,
    );
  }

  @Get(":id")
  @Scopes("issues:read")
  @ApiOperation({ summary: "Issue detail with its signals" })
  get(@CurrentPrincipal() principal: UserPrincipal, @Param("id") id: string) {
    return this.issues.get(principal.tenantId, id);
  }

  @Get(":id/context")
  @Scopes("issues:read")
  @ApiOperation({
    summary:
      "Bounded agent context for this issue (cached; enrichment runs once)",
  })
  context(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param("id") id: string,
  ) {
    return this.triage.buildIssueContext(principal.tenantId, id);
  }

  @Post(":id/retry")
  @HttpCode(HttpStatus.OK)
  @Scopes("issues:write")
  @Audit("issue.retry", { targetType: "issue", targetParam: "id" })
  @ApiOperation({ summary: "Start a fresh run for a finished report" })
  retry(@CurrentPrincipal() principal: UserPrincipal, @Param("id") id: string) {
    return this.issues.retry(principal.tenantId, id);
  }

  @Post(":id/ignore")
  @HttpCode(HttpStatus.OK)
  @Scopes("issues:write")
  @Audit("issue.ignore", { targetType: "issue", targetParam: "id" })
  @ApiOperation({ summary: "Ignore the report and cancel any open run" })
  ignore(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param("id") id: string,
  ) {
    return this.issues.ignore(principal.tenantId, id);
  }

  @Post(":id/approve")
  @HttpCode(HttpStatus.OK)
  @Scopes("issues:write")
  @Audit("issue.approve", { targetType: "issue", targetParam: "id" })
  @ApiOperation({ summary: "Confirm the shipped fix and resolve the report" })
  approve(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param("id") id: string,
  ) {
    return this.issues.approve(principal.tenantId, id);
  }

  @Post(":id/pr")
  @HttpCode(HttpStatus.ACCEPTED)
  @Scopes("issues:write")
  @Audit("issue.ship", { targetType: "issue", targetParam: "id" })
  @ApiOperation({
    summary: "Ship a ready report: open its pull request",
  })
  shipPr(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param("id") id: string,
  ) {
    return this.issues.shipPr(principal.tenantId, id);
  }

  @Post(":id/ticket")
  @HttpCode(HttpStatus.ACCEPTED)
  @Scopes("issues:write")
  @Audit("issue.ticket", { targetType: "issue", targetParam: "id" })
  @ApiOperation({
    summary: "Ship a ready report: create its Jira ticket",
  })
  createTicket(
    @CurrentPrincipal() principal: UserPrincipal,
    @Param("id") id: string,
  ) {
    return this.issues.createTicket(principal.tenantId, id);
  }
}
