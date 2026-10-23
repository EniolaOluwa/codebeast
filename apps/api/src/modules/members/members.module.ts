import { Module } from "@nestjs/common";

import { MembersController } from "./members.controller.ts";
import { MembersService } from "./members.service.ts";

@Module({
  controllers: [MembersController],
  providers: [MembersService],
})
export class MembersModule {}
