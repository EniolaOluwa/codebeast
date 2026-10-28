import { Global, Module } from "@nestjs/common";

import { CryptoService } from "./crypto.service.ts";

@Global()
@Module({
  providers: [CryptoService],
  exports: [CryptoService],
})
export class CryptoModule {}
