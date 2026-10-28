import { issueListQuerySchema } from "@repo/types";
import { createZodDto } from "nestjs-zod";

export class IssueListQueryDto extends createZodDto(issueListQuerySchema) {}
