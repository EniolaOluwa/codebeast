import { Global, Module } from "@nestjs/common";

import { AuditController } from "./audit.controller.ts";
import { AuditService } from "./audit.service.ts";

@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
