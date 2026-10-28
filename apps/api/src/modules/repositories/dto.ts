import { paginatedResponseSchema, RepositoryProviderSchema } from "@repo/types";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const CreateRepositorySchema = z.object({
  provider: RepositoryProviderSchema.default("GITHUB"),
  externalId: z.string().min(1),
  fullName: z.string().min(1),
  defaultBranch: z.string().min(1).default("main"),
  installationId: z.string().optional(),
});
export class CreateRepositoryDto extends createZodDto(CreateRepositorySchema) {}

export const UpdateRepositorySchema = z.object({
  defaultBranch: z.string().min(1).optional(),
  installationId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});
export class UpdateRepositoryDto extends createZodDto(UpdateRepositorySchema) {}

export const RepositoryViewSchema = z.object({
  id: z.string(),
  provider: RepositoryProviderSchema,
  externalId: z.string(),
  fullName: z.string(),
  defaultBranch: z.string(),
  installationId: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export class RepositoryViewDto extends createZodDto(RepositoryViewSchema) {}

export const RepositoryListResponseSchema =
  paginatedResponseSchema(RepositoryViewSchema);
export class RepositoryListResponseDto extends createZodDto(
  RepositoryListResponseSchema,
) {}

export interface RepositoryView {
  id: string;
  provider: string;
  externalId: string;
  fullName: string;
  defaultBranch: string;
  installationId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
