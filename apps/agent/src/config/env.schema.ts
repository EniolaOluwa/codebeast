import { z } from "zod";

const DEV_AGENT_TOKEN = "dev-agent-token-change-me";
const DEV_LLM_API_KEY = "dev-only-unset-llm-api-key";

const SECRETS_REQUIRED_IN_PRODUCTION = [
  "AGENT_SERVICE_TOKEN",
  "LLM_API_KEY",
] as const;

export const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3002),
  HOST: z.string().min(1).default("0.0.0.0"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  AGENT_SERVICE_TOKEN: z.string().min(8).default(DEV_AGENT_TOKEN),
  LLM_BASE_URL: z.string().url().default("https://api.deepseek.com"),
  LLM_API_KEY: z.string().min(1).default(DEV_LLM_API_KEY),
  LLM_MODEL_PLANNER: z.string().min(1).default("deepseek-reasoner"),
  LLM_MODEL_CODER: z.string().min(1).default("deepseek-chat"),
  LLM_MAX_TURNS: z.coerce.number().int().positive().default(24),
  WORKSPACE_ROOT: z.string().min(1).default("/tmp/codebeast-workspaces"),
  WORKSPACE_TTL_MS: z.coerce.number().int().positive().default(3_600_000),
  SANDBOX_IMAGE: z.string().min(1).default("node:22-bookworm"),
  SANDBOX_TIMEOUT_MS: z.coerce.number().int().positive().default(600_000),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  // Empty strings from `.env` (e.g. `LLM_API_KEY=`) must not defeat defaults.
  const normalized: Record<string, unknown> = { ...config };
  for (const [key, value] of Object.entries(normalized)) {
    if (value === "") {
      delete normalized[key];
    }
  }

  if (normalized.NODE_ENV === "production") {
    const missing = SECRETS_REQUIRED_IN_PRODUCTION.filter(
      (key) => !normalized[key],
    );
    if (missing.length > 0) {
      throw new Error(
        `Invalid environment variables: ${missing.join(", ")} must be set explicitly in production (no dev defaults)`,
      );
    }
  }

  const parsed = envSchema.safeParse(normalized);

  if (!parsed.success) {
    throw new Error(
      `Invalid environment variables: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`,
    );
  }

  return parsed.data;
}
