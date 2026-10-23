import {
  paginationQuerySchema,
  repositoryCreateInputSchema,
  repositoryUpdateInputSchema,
} from "@repo/types";
import { createZodDto } from "nestjs-zod";

export class RepositoryCreateDto extends createZodDto(
  repositoryCreateInputSchema,
) {}
export class RepositoryUpdateDto extends createZodDto(
  repositoryUpdateInputSchema,
) {}
export class PaginationQueryDto extends createZodDto(paginationQuerySchema) {}
