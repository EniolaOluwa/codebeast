import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.string(),
  uptime: z.number(),
  environment: z.string(),
  version: z.string(),
});

export class HealthResponseDto extends createZodDto(HealthResponseSchema) {}

const checkStatusSchema = z.enum(["up", "down"]);

export const ReadinessResponseSchema = z.object({
  status: z.literal("ready"),
  timestamp: z.string(),
  checks: z.object({
    db: checkStatusSchema,
    redis: checkStatusSchema,
  }),
});

export class ReadinessResponseDto extends createZodDto(
  ReadinessResponseSchema,
) {}
