import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

import { Scopes } from "../../common/decorators/scopes.decorator.ts";
import {
  IssueDetailDto,
  IssueListResponseDto,
  IssueStatusResponseDto,
  ListIssuesQueryDto,
  ListRunsQueryDto,
  RunListResponseDto,
  StartRunResponseDto,
} from "../runs/dto.ts";
import { RunService } from "../runs/run.service.ts";
import { IssuesService } from "./issues.service.ts";

@ApiTags("issues")
@Controller({ path: "issues", version: "1" })
export class IssuesController {
  constructor(
    private readonly issues: IssuesService,
    private readonly runs: RunService,
  ) {}

  @Get()
  @Scopes("issues:read")
  @ApiOperation({ summary: "List triaged issues" })
  @ApiOkResponse({ type: IssueListResponseDto })
  list(@Query() query: ListIssuesQueryDto) {
    return this.issues.list(query);
  }

  @Get(":id")
  @Scopes("issues:read")
  @ApiOperation({ summary: "Get an issue with signals and runs" })
  @ApiOkResponse({ type: IssueDetailDto })
  get(@Param("id") id: string) {
    return this.issues.get(id);
  }

  @Get(":id/runs")
  @Scopes("runs:read")
  @ApiOperation({ summary: "List runs for an issue" })
  @ApiOkResponse({ type: RunListResponseDto })
  listRuns(@Param("id") id: string, @Query() query: ListRunsQueryDto) {
    return this.runs.listByIssue(id, query.page, query.limit);
  }

  @Post(":id/retry")
  @HttpCode(HttpStatus.OK)
  @Scopes("runs:write")
  @ApiOperation({ summary: "Start a new run for an issue" })
  @ApiOkResponse({ type: StartRunResponseDto })
  retry(@Param("id") id: string) {
    return this.issues.retry(id);
  }

  @Post(":id/ignore")
  @HttpCode(HttpStatus.OK)
  @Scopes("issues:write")
  @ApiOperation({ summary: "Mark an issue ignored" })
  @ApiOkResponse({ type: IssueStatusResponseDto })
  ignore(@Param("id") id: string) {
    return this.issues.ignore(id);
  }

  @Post(":id/approve")
  @HttpCode(HttpStatus.OK)
  @Scopes("issues:write")
  @ApiOperation({ summary: "Mark an issue resolved" })
  @ApiOkResponse({ type: IssueStatusResponseDto })
  approve(@Param("id") id: string) {
    return this.issues.approve(id);
  }
}
