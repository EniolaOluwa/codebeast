import { ApiKeyScopeSchema, paginatedResponseSchema } from "@repo/types";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(120),
  scopes: z.array(ApiKeyScopeSchema).min(1),
  expiresAt: z.iso.datetime().optional(),
});
export class CreateApiKeyDto extends createZodDto(CreateApiKeySchema) {}

export const ApiKeyViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  scopes: z.array(z.string()),
  lastUsedAt: z.iso.datetime().nullable(),
  expiresAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export class ApiKeyViewDto extends createZodDto(ApiKeyViewSchema) {}

export const CreatedApiKeyViewSchema = ApiKeyViewSchema.extend({
  key: z.string(),
});
export class CreatedApiKeyViewDto extends createZodDto(
  CreatedApiKeyViewSchema,
) {}

export const ApiKeyListResponseSchema =
  paginatedResponseSchema(ApiKeyViewSchema);
export class ApiKeyListResponseDto extends createZodDto(
  ApiKeyListResponseSchema,
) {}

export interface ApiKeyView {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface CreatedApiKeyView extends ApiKeyView {
  key: string;
}
