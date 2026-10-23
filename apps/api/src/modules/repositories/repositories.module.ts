import { Module } from "@nestjs/common";

import { RepositoriesController } from "./repositories.controller.ts";
import { RepositoriesService } from "./repositories.service.ts";

@Module({
  controllers: [RepositoriesController],
  providers: [RepositoriesService],
})
export class RepositoriesModule {}
