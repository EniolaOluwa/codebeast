import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";

import { CurrentPrincipal, Public } from "../../common/auth/decorators.ts";
import type { UserPrincipal } from "../../common/auth/principal.ts";
import {
  AuthTokensDto,
  LoginDto,
  MeDto,
  RefreshDto,
  RegisterDto,
} from "./auth.dto.ts";
import { AuthService } from "./auth.service.ts";

@ApiTags("auth")
@Controller("auth")
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("register")
  @ApiOperation({ summary: "Create a user, personal tenant and session" })
  @ApiOkResponse({ type: AuthTokensDto })
  register(@Body() dto: RegisterDto): Promise<AuthTokensDto> {
    return this.auth.register(dto);
  }

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Exchange credentials for tokens" })
  @ApiOkResponse({ type: AuthTokensDto })
  login(@Body() dto: LoginDto): Promise<AuthTokensDto> {
    return this.auth.login(dto);
  }

  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Rotate a refresh token" })
  @ApiOkResponse({ type: AuthTokensDto })
  refresh(@Body() dto: RefreshDto): Promise<AuthTokensDto> {
    return this.auth.refresh(dto);
  }

  @Public()
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Revoke a refresh token (idempotent)" })
  logout(@Body() dto: RefreshDto): Promise<{ success: true }> {
    return this.auth.logout(dto);
  }

  @Get("me")
  @ApiOperation({ summary: "Current user, tenant and role" })
  @ApiOkResponse({ type: MeDto })
  me(@CurrentPrincipal() principal: UserPrincipal): Promise<MeDto> {
    return this.auth.me(principal);
  }
}
