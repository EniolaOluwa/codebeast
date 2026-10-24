import { Module } from "@nestjs/common";

import { RunsModule } from "../runs/runs.module.ts";
import { IssuesController } from "./issues.controller.ts";
import { IssuesService } from "./issues.service.ts";
import { TriageService } from "./triage.service.ts";

@Module({
  imports: [RunsModule],
  controllers: [IssuesController],
  providers: [IssuesService, TriageService],
  exports: [IssuesService, TriageService],
})
export class IssuesModule {}
