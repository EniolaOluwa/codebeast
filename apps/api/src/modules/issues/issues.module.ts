import { Module } from "@nestjs/common";

import { TriageModule } from "../triage/triage.module.ts";
import { IssuesController } from "./issues.controller.ts";
import { IssuesService } from "./issues.service.ts";

@Module({
  imports: [TriageModule],
  controllers: [IssuesController],
  providers: [IssuesService],
})
export class IssuesModule {}
