import { runListQuerySchema } from "@repo/types";
import { createZodDto } from "nestjs-zod";

export class RunListQueryDto extends createZodDto(runListQuerySchema) {}
