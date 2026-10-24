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
  JWT_SECRET: z
    .string()
    .min(32)
    .default("development-only-access-secret-change-me"),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2_592_000),
  ENCRYPTION_KEY: z
    .string()
    .min(32)
    .default("development-only-encryption-key-change-me"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  QUEUE_ENABLED: z
    .string()
    .default("true")
    .transform((value) => value !== "false"),
  AGENT_SERVICE_URL: z.string().url().default("http://localhost:4000"),
  WEBHOOK_BASE_URL: z.string().url().default("http://localhost:3001"),
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().optional(),
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
