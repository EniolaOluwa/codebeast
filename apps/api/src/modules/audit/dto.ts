import {
  auditLogListQuerySchema,
  auditLogListResponseSchema,
  auditLogViewSchema,
} from "@repo/types";
import { createZodDto } from "nestjs-zod";

export class AuditLogViewDto extends createZodDto(auditLogViewSchema) {}

export class AuditLogListResponseDto extends createZodDto(
  auditLogListResponseSchema,
) {}

export class AuditLogListQueryDto extends createZodDto(
  auditLogListQuerySchema,
) {}
