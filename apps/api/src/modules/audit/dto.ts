import { ActorTypeSchema, paginatedResponseSchema } from "@repo/types";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const AuditLogViewSchema = z.object({
  id: z.string(),
  tenantId: z.uuid(),
  actorType: ActorTypeSchema,
  actorId: z.string().nullable(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string().nullable(),
  metadata: z.unknown(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export class AuditLogViewDto extends createZodDto(AuditLogViewSchema) {}

export const AuditLogListResponseSchema =
  paginatedResponseSchema(AuditLogViewSchema);
export class AuditLogListResponseDto extends createZodDto(
  AuditLogListResponseSchema,
) {}
