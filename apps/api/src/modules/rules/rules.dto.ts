import {
  ruleCreateInputSchema,
  ruleListQuerySchema,
  ruleUpdateInputSchema,
} from "@repo/types";
import { createZodDto } from "nestjs-zod";

export class RuleCreateDto extends createZodDto(ruleCreateInputSchema) {}
export class RuleUpdateDto extends createZodDto(ruleUpdateInputSchema) {}
export class RuleListQueryDto extends createZodDto(ruleListQuerySchema) {}
