import {
  integrationCreateInputSchema,
  integrationUpdateInputSchema,
  paginationQuerySchema,
} from "@repo/types";
import { createZodDto } from "nestjs-zod";

export class IntegrationCreateDto extends createZodDto(
  integrationCreateInputSchema,
) {}
export class IntegrationUpdateDto extends createZodDto(
  integrationUpdateInputSchema,
) {}
export class PaginationQueryDto extends createZodDto(paginationQuerySchema) {}
