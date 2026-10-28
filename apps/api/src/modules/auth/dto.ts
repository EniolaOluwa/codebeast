import {
  AuthSessionResponseSchema,
  CurrentUserSchema,
  LoginRequestSchema,
  RefreshRequestSchema,
  RegisterRequestSchema,
} from "@repo/types";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export class RegisterDto extends createZodDto(RegisterRequestSchema) {}
export class LoginDto extends createZodDto(LoginRequestSchema) {}
export class RefreshDto extends createZodDto(RefreshRequestSchema) {}
export class AuthSessionDto extends createZodDto(AuthSessionResponseSchema) {}
export class CurrentUserDto extends createZodDto(CurrentUserSchema) {}

export const LogoutResponseSchema = z.object({ loggedOut: z.boolean() });
export class LogoutResponseDto extends createZodDto(LogoutResponseSchema) {}
