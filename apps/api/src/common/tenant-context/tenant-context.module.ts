import { Global, Module } from "@nestjs/common";

import { TenantContextService } from "./tenant-context.service.ts";

@Global()
@Module({
  providers: [TenantContextService],
  exports: [TenantContextService],
})
export class TenantContextModule {}
