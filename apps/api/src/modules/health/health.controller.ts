import { Controller, Get, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Redis } from "ioredis";

import { Public } from "../../common/auth/decorators.ts";
import { ServiceUnavailableError } from "../../common/errors/errors.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";
import { REDIS_CLIENT } from "../../redis/redis.tokens.ts";
import { HealthResponseDto, ReadinessResponseDto } from "./health.dto.ts";

const CHECK_TIMEOUT_MS = 1_000;

@ApiTags("health")
@Public()
@Controller()
export class HealthController {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
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
  @ApiOperation({ summary: "Readiness check endpoint (db + redis)" })
  @ApiOkResponse({ type: ReadinessResponseDto })
  async ready(): Promise<ReadinessResponseDto> {
    const [db, redis] = await Promise.all([
      this.probe("db", () => this.prisma.ping()),
      this.probe("redis", async () => {
        const reply = await this.redis.ping();
        if (reply !== "PONG") {
          throw new Error(`unexpected redis ping reply: ${reply}`);
        }
      }),
    ]);

    const checks = { db, redis };

    if (db !== "up" || redis !== "up") {
      throw new ServiceUnavailableError("One or more dependencies are down", {
        checks,
      });
    }

    return {
      status: "ready",
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  private async probe(
    _name: "db" | "redis",
    fn: () => Promise<void>,
  ): Promise<"up" | "down"> {
    try {
      await Promise.race([
        fn(),
        new Promise<never>((_resolve, reject) => {
          setTimeout(
            () => reject(new Error("probe timed out")),
            CHECK_TIMEOUT_MS,
          );
        }),
      ]);
      return "up";
    } catch {
      return "down";
    }
  }
}
