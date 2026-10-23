import { z } from "zod";

import { apiKeyScopeSchema, membershipRoleSchema } from "./enums.ts";

/** Auth + identity wire contracts (ADR-003: JWT for humans, API keys for machines). */

export const userSchema = z.object({
  id: z.string().min(1),
  email: z.email(),
  name: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type User = z.infer<typeof userSchema>;

export const registerInputSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100).optional(),
  tenantName: z.string().min(1).max(100).optional(),
});
export type RegisterInput = z.infer<typeof registerInputSchema>;

export const loginInputSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const refreshInputSchema = z.object({
  refreshToken: z.string().min(20).max(200),
});
export type RefreshInput = z.infer<typeof refreshInputSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  tokenType: z.literal("Bearer"),
  expiresIn: z.number().int().positive(),
});
export type AuthTokens = z.infer<typeof authTokensSchema>;

export const membershipSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  role: membershipRoleSchema,
  createdAt: z.iso.datetime(),
});
export type Membership = z.infer<typeof membershipSchema>;

export const apiKeyCreateInputSchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(apiKeyScopeSchema).min(1).max(20),
});
export type ApiKeyCreateInput = z.infer<typeof apiKeyCreateInputSchema>;

export const apiKeySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  prefix: z.string().min(1),
  scopes: z.array(apiKeyScopeSchema),
  lastUsedAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type ApiKey = z.infer<typeof apiKeySchema>;

/** Returned exactly once, on creation. Only the hash is persisted. */
export const apiKeyCreatedSchema = apiKeySchema.extend({
  key: z.string().min(1),
});
export type ApiKeyCreated = z.infer<typeof apiKeyCreatedSchema>;

export const memberInviteInputSchema = z.object({
  email: z.email(),
  role: z.enum(["ADMIN", "MEMBER"]),
});
export type MemberInviteInput = z.infer<typeof memberInviteInputSchema>;

export const memberUpdateInputSchema = z.object({
  role: membershipRoleSchema,
});
export type MemberUpdateInput = z.infer<typeof memberUpdateInputSchema>;
