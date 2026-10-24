import { Controller, Get, Param } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

import { Scopes } from "../../common/decorators/scopes.decorator.ts";
import { RunDetailDto } from "./dto.ts";
import { RunService } from "./run.service.ts";

@ApiTags("runs")
@Controller({ path: "runs", version: "1" })
export class RunsController {
  constructor(private readonly runs: RunService) {}

  @Get(":id")
  @Scopes("runs:read")
  @ApiOperation({ summary: "Get a run with plan, patch and validations" })
  @ApiOkResponse({ type: RunDetailDto })
  get(@Param("id") id: string) {
    return this.runs.get(id);
  }
}
