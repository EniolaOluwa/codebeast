import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

import { PrismaService } from "../../prisma/prisma.service.ts";
import { HealthResponseDto, ReadinessResponseDto } from "./health.dto.ts";

@ApiTags("health")
@Controller()
export class HealthController {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Get("health")
  @ApiOperation({ summary: "Health check endpoint" })
  @ApiOkResponse({ type: HealthResponseDto })
  check(): HealthResponseDto {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: this.config.getOrThrow<string>("NODE_ENV"),
      version: "1.0.0",
    };
  }

  @Get("health/ready")
  @ApiOperation({ summary: "Readiness check endpoint" })
  @ApiOkResponse({ type: ReadinessResponseDto })
  async ready(): Promise<ReadinessResponseDto> {
    await this.prisma.ping();
    return { status: "ready", timestamp: new Date().toISOString() };
  }
}
