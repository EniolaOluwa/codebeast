import { Module } from "@nestjs/common";

import { PullRequestsController } from "./pull-requests.controller.ts";
import { RunService } from "./run.service.ts";
import { RunsController } from "./runs.controller.ts";

@Module({
  controllers: [RunsController, PullRequestsController],
  providers: [RunService],
  exports: [RunService],
})
export class RunsModule {}
