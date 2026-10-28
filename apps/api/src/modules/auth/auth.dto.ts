import {
  authTokensSchema,
  loginInputSchema,
  meSchema,
  refreshInputSchema,
  registerInputSchema,
} from "@repo/types";
import { createZodDto } from "nestjs-zod";

export class RegisterDto extends createZodDto(registerInputSchema) {}
export class LoginDto extends createZodDto(loginInputSchema) {}
export class RefreshDto extends createZodDto(refreshInputSchema) {}
export class AuthTokensDto extends createZodDto(authTokensSchema) {}
export class MeDto extends createZodDto(meSchema) {}
