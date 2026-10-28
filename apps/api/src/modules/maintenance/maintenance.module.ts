import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.ts";
import { MetricsModule } from "../metrics/metrics.module.ts";
import { MaintenanceScheduler } from "./maintenance.scheduler.ts";
import { RawPayloadJanitor } from "./raw-payload-janitor.service.ts";
import { StalledRunReaper } from "./stalled-run-reaper.service.ts";

@Module({
  imports: [AuditModule, MetricsModule],
  providers: [StalledRunReaper, RawPayloadJanitor, MaintenanceScheduler],
  exports: [StalledRunReaper, RawPayloadJanitor],
})
export class MaintenanceModule {}
