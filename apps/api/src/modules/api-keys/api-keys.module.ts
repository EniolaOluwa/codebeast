import { Module } from "@nestjs/common";

import { ApiKeysController } from "./api-keys.controller.ts";
import { ApiKeysService } from "./api-keys.service.ts";

@Module({
  controllers: [ApiKeysController],
  providers: [ApiKeysService],
})
export class ApiKeysModule {}
