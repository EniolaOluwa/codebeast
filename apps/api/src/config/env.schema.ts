export const envSchema = {
  type: "object",
  required: ["DATABASE_URL"],
  properties: {
    PORT: { type: "string", default: "3001" },
    HOST: { type: "string", default: "0.0.0.0" },
    NODE_ENV: {
      type: "string",
      enum: ["development", "production", "test"],
      default: "development",
    },
    DATABASE_URL: { type: "string" },
    CORS_ORIGIN: { type: "string", default: "*" },
    LOG_LEVEL: { type: "string", default: "info" },
  },
  additionalProperties: false,
} as const;

export interface Env {
  PORT: string;
  HOST: string;
  NODE_ENV: "development" | "production" | "test";
  DATABASE_URL: string;
  CORS_ORIGIN: string;
  LOG_LEVEL: string;
}
