import { Global, Module } from "@nestjs/common";

import { JwtService } from "./auth/jwt.service.ts";
import { TenantContext } from "./context/tenant-context.ts";
import { CryptoService } from "./crypto/crypto.service.ts";

@Global()
@Module({
  providers: [TenantContext, CryptoService, JwtService],
  exports: [TenantContext, CryptoService, JwtService],
})
export class CoreModule {}
