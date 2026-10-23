import {
  apiKeyCreatedSchema,
  apiKeyCreateInputSchema,
  paginationQuerySchema,
} from "@repo/types";
import { createZodDto } from "nestjs-zod";

export class ApiKeyCreateDto extends createZodDto(apiKeyCreateInputSchema) {}
export class ApiKeyCreatedDto extends createZodDto(apiKeyCreatedSchema) {}
export class PaginationQueryDto extends createZodDto(paginationQuerySchema) {}
