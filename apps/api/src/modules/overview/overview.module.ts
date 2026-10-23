import { Module } from "@nestjs/common";

import { OverviewController } from "./overview.controller.ts";
import { OverviewService } from "./overview.service.ts";

@Module({
  controllers: [OverviewController],
  providers: [OverviewService],
})
export class OverviewModule {}
