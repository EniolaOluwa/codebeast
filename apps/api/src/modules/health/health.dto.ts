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

export const ReadinessResponseSchema = z.object({
  status: z.literal("ready"),
  timestamp: z.string(),
});

export class ReadinessResponseDto extends createZodDto(
  ReadinessResponseSchema,
) {}
