import { Module } from "@nestjs/common";

import { RuleEngine } from "./rule-engine.service.ts";
import { RulesController } from "./rules.controller.ts";
import { RulesService } from "./rules.service.ts";

@Module({
  controllers: [RulesController],
  providers: [RuleEngine, RulesService],
  exports: [RuleEngine],
})
export class RulesModule {}
