import { Global, Module } from "@nestjs/common";

import { TokenService } from "./token.service.ts";

@Global()
@Module({
  providers: [TokenService],
  exports: [TokenService],
})
export class TokensModule {}
