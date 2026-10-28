import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.ts";
import { AuthController } from "./auth.controller.ts";
import { AuthService } from "./auth.service.ts";

@Module({
  imports: [AuditModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
