import { Module } from "@nestjs/common";

import { TenantsController } from "./tenants.controller.ts";

@Module({
  controllers: [TenantsController],
})
export class TenantsModule {}
