import { Module } from "@nestjs/common";

import { IntegrationsController } from "./integrations.controller.ts";
import { IntegrationsService } from "./integrations.service.ts";

@Module({
  controllers: [IntegrationsController],
  providers: [IntegrationsService],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
