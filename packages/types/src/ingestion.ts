import { z } from "zod";

import { providerSchema } from "./enums.ts";

/** Repository and integration wire contracts (ingestion inputs). */

export const repositorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  fullName: z.string().min(1),
  defaultBranch: z.string().min(1),
  githubRepoId: z.number().int().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Repository = z.infer<typeof repositorySchema>;

const repositoryNameSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9][a-z0-9._-]*$/, "must be a lowercase slug");

const repositoryFullNameSchema = z
  .string()
  .min(3)
  .max(200)
  .regex(/^[\w.-]+\/[\w.-]+$/, "must look like owner/name");

export const repositoryCreateInputSchema = z.object({
  name: repositoryNameSchema,
  fullName: repositoryFullNameSchema,
  defaultBranch: z.string().min(1).max(100).default("main"),
  githubRepoId: z.number().int().positive().optional(),
});
export type RepositoryCreateInput = z.infer<typeof repositoryCreateInputSchema>;

export const repositoryUpdateInputSchema = z.object({
  name: repositoryNameSchema.optional(),
  fullName: repositoryFullNameSchema.optional(),
  defaultBranch: z.string().min(1).max(100).optional(),
  githubRepoId: z.number().int().positive().nullable().optional(),
});
export type RepositoryUpdateInput = z.infer<typeof repositoryUpdateInputSchema>;

export const integrationSchema = z.object({
  id: z.string().min(1),
  type: providerSchema,
  name: z.string().min(1),
  externalId: z.string().nullable(),
  config: z.record(z.string(), z.unknown()),
  enabled: z.boolean(),
  repositoryId: z.string().nullable(),
  hasSecrets: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Integration = z.infer<typeof integrationSchema>;

export const integrationCreateInputSchema = z.object({
  type: providerSchema,
  name: z.string().min(1).max(100),
  externalId: z.string().min(1).max(200).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  /** Stored AES-256-GCM encrypted; never returned. */
  secrets: z.record(z.string(), z.string().min(1)).optional(),
  repositoryId: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
});
export type IntegrationCreateInput = z.infer<
  typeof integrationCreateInputSchema
>;

export const integrationUpdateInputSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  externalId: z.string().min(1).max(200).nullable().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  secrets: z.record(z.string(), z.string().min(1)).optional(),
  repositoryId: z.string().min(1).nullable().optional(),
  enabled: z.boolean().optional(),
});
export type IntegrationUpdateInput = z.infer<
  typeof integrationUpdateInputSchema
>;
