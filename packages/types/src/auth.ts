import { z } from "zod";

import { RoleSchema } from "./enums.ts";

export const LoginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const RegisterRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(120).optional(),
  tenantName: z.string().min(1).max(120),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const RefreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

export const AuthTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int().positive(),
});
export type AuthTokens = z.infer<typeof AuthTokensSchema>;

export const CurrentUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  tenantId: z.uuid(),
  role: RoleSchema,
});
export type CurrentUser = z.infer<typeof CurrentUserSchema>;

export const AuthSessionResponseSchema = z.object({
  user: CurrentUserSchema,
  tokens: AuthTokensSchema,
});
export type AuthSessionResponse = z.infer<typeof AuthSessionResponseSchema>;
