import { z } from "zod";

import { actorTypeSchema } from "./enums.ts";

/**
 * Transport-level envelopes. Every API error (from the global exception
 * filter) matches `errorEnvelopeSchema`; every paginated list matches
 * `paginatedResponseSchema`.
 */

export const errorEnvelopeSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.unknown().optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

export const paginationMetaSchema = z.object({
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
});
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export function paginatedResponseSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    success: z.literal(true),
    data: z.array(item),
    pagination: paginationMetaSchema,
  });
}

/** @deprecated Prefer the typed envelopes above; kept for existing consumers. */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface PaginatedResponse<T = unknown> {
  success: true;
  data: T[];
  pagination: PaginationMeta;
}

/** Audit log row returned by GET /v1/audit-logs. */
export const auditLogViewSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  actorType: actorTypeSchema,
  actorId: z.string().nullable(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string().nullable(),
  metadata: z.unknown().nullable(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type AuditLogView = z.infer<typeof auditLogViewSchema>;

export const auditLogListResponseSchema =
  paginatedResponseSchema(auditLogViewSchema);
export type AuditLogListResponse = z.infer<typeof auditLogListResponseSchema>;

/** Query filters for GET /v1/audit-logs. */
export const auditLogListQuerySchema = paginationQuerySchema.extend({
  actorType: actorTypeSchema.optional(),
  action: z.string().min(1).max(128).optional(),
  targetType: z.string().min(1).max(64).optional(),
  targetId: z.string().min(1).max(64).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});
export type AuditLogListQuery = z.infer<typeof auditLogListQuerySchema>;
