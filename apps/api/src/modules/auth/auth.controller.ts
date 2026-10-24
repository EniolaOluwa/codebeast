import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { CurrentUser } from "@repo/types";
import type { FastifyRequest } from "fastify";

import type { RequestContext } from "../../common/context/request-context.ts";
import { CurrentContext } from "../../common/decorators/current-context.decorator.ts";
import { Public } from "../../common/decorators/public.decorator.ts";
import { UnauthorizedError } from "../../common/errors/errors.ts";
import { AuthService } from "./auth.service.ts";
import {
  AuthSessionDto,
  CurrentUserDto,
  LoginDto,
  LogoutResponseDto,
  RefreshDto,
  RegisterDto,
} from "./dto.ts";

@ApiTags("auth")
@Controller({ path: "auth", version: "1" })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("register")
  @ApiOperation({ summary: "Create a tenant and its owner account" })
  @ApiCreatedResponse({ type: AuthSessionDto })
  register(
    @Body() dto: RegisterDto,
    @Req() request: FastifyRequest,
  ): Promise<AuthSessionDto> {
    return this.auth.register(dto, {
      userAgent: request.headers["user-agent"],
      ip: request.ip,
    }) as Promise<AuthSessionDto>;
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Exchange credentials for tokens" })
  @ApiOkResponse({ type: AuthSessionDto })
  login(
    @Body() dto: LoginDto,
    @Req() request: FastifyRequest,
  ): Promise<AuthSessionDto> {
    return this.auth.login(dto, {
      userAgent: request.headers["user-agent"],
      ip: request.ip,
    }) as Promise<AuthSessionDto>;
  }

  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Rotate a refresh token" })
  @ApiOkResponse({ type: AuthSessionDto })
  refresh(@Body() dto: RefreshDto): Promise<AuthSessionDto> {
    return this.auth.refresh(dto.refreshToken) as Promise<AuthSessionDto>;
  }

  @Public()
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Revoke a refresh token" })
  @ApiOkResponse({ type: LogoutResponseDto })
  logout(@Body() dto: RefreshDto): Promise<LogoutResponseDto> {
    return this.auth.logout(dto.refreshToken);
  }

  @Get("me")
  @ApiOperation({ summary: "Current user and tenant" })
  @ApiOkResponse({ type: CurrentUserDto })
  me(@CurrentContext() context?: RequestContext): Promise<CurrentUser> {
    if (!context?.actorId) {
      throw new UnauthorizedError();
    }
    return this.auth.me(context.actorId, context.tenantId);
  }
}
