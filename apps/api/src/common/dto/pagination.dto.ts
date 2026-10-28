import { PaginationQuerySchema } from "@repo/types";
import { createZodDto } from "nestjs-zod";

export class PaginationQueryDto extends createZodDto(PaginationQuerySchema) {}
