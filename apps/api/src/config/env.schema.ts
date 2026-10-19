import { z } from "zod";

export const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().min(1).default("0.0.0.0"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGIN: z.string().min(1).default("*"),
  LOG_LEVEL: z
    .enum(["error", "warn", "info", "debug", "verbose"])
    .default("info"),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);

  if (!parsed.success) {
    throw new Error(
      `Invalid environment variables: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`,
    );
  }

  return parsed.data;
}
