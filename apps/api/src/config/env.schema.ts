import { z } from "zod";

/**
 * Development-only defaults. `validateEnv` refuses to fall back to these when
 * NODE_ENV is `production`, so a misconfigured production deployment fails at
 * startup instead of signing tokens with a public secret.
 */
const DEV_JWT_SECRET = "dev-only-jwt-secret-do-not-use-in-production";
const DEV_ENCRYPTION_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

const SECRETS_REQUIRED_IN_PRODUCTION = [
  "JWT_SECRET",
  "ENCRYPTION_KEY",
] as const;

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
  JWT_SECRET: z.string().min(32).default(DEV_JWT_SECRET),
  /** Base64-encoded 32 bytes for AES-256-GCM (`openssl rand -base64 32`). */
  ENCRYPTION_KEY: z.string().min(1).default(DEV_ENCRYPTION_KEY),
  AUTH_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  AUTH_REFRESH_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(1_209_600),
  WEBHOOK_RAW_TTL_DAYS: z.coerce.number().int().min(0).default(7),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  /** Debounce window: signals for one issue coalesce into a single triage. */
  INGEST_COALESCE_MS: z.coerce.number().int().min(0).default(30_000),
  /** GitHub App (ADR-005). When unset, the stub GitHub client is used. */
  GITHUB_APP_ID: z.string().optional(),
  /** Base64-encoded PEM private key (`base64 -i app.pem`). */
  GITHUB_APP_PRIVATE_KEY_BASE64: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  if (config.NODE_ENV === "production") {
    const missing = SECRETS_REQUIRED_IN_PRODUCTION.filter(
      (key) => !config[key],
    );
    if (missing.length > 0) {
      throw new Error(
        `Invalid environment variables: ${missing.join(", ")} must be set explicitly in production (no dev defaults)`,
      );
    }
  }

  const parsed = envSchema.safeParse(config);

  if (!parsed.success) {
    throw new Error(
      `Invalid environment variables: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`,
    );
  }

  return parsed.data;
}
