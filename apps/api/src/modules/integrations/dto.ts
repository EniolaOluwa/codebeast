import {
  IntegrationStatusSchema,
  IntegrationTypeSchema,
  paginatedResponseSchema,
} from "@repo/types";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const CreateIntegrationSchema = z.object({
  type: IntegrationTypeSchema,
  name: z.string().min(1).max(120),
  config: z.record(z.string(), z.unknown()).default({}),
  secret: z.string().min(1).optional(),
  repositoryId: z.string().optional(),
  externalAccountId: z.string().optional(),
});
export class CreateIntegrationDto extends createZodDto(
  CreateIntegrationSchema,
) {}

export const UpdateIntegrationSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  secret: z.string().min(1).nullable().optional(),
  status: IntegrationStatusSchema.optional(),
  repositoryId: z.string().nullable().optional(),
});
export class UpdateIntegrationDto extends createZodDto(
  UpdateIntegrationSchema,
) {}

export const IntegrationViewSchema = z.object({
  id: z.string(),
  type: IntegrationTypeSchema,
  status: IntegrationStatusSchema,
  name: z.string(),
  config: z.unknown(),
  externalAccountId: z.string().nullable(),
  repositoryId: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export class IntegrationViewDto extends createZodDto(IntegrationViewSchema) {}

export const IntegrationListResponseSchema = paginatedResponseSchema(
  IntegrationViewSchema,
);
export class IntegrationListResponseDto extends createZodDto(
  IntegrationListResponseSchema,
) {}

export interface IntegrationView {
  id: string;
  type: string;
  status: string;
  name: string;
  config: unknown;
  externalAccountId: string | null;
  repositoryId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IntegrationWithSecret {
  id: string;
  tenantId: string;
  type: string;
  secret: string | null;
  repositoryId: string | null;
}
