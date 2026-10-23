import { describe, expect, it } from "vitest";

import { validateEnv } from "./env.schema.ts";

const DATABASE_URL = "postgresql://localhost/db";

describe("validateEnv", () => {
  it("applies defaults and coerces PORT", () => {
    const env = validateEnv({ DATABASE_URL });

    expect(env).toEqual({
      PORT: 3001,
      HOST: "0.0.0.0",
      NODE_ENV: "development",
      DATABASE_URL,
      CORS_ORIGIN: "*",
      LOG_LEVEL: "info",
      JWT_SECRET: "dev-only-jwt-secret-do-not-use-in-production",
      ENCRYPTION_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
      AUTH_ACCESS_TTL_SECONDS: 900,
      AUTH_REFRESH_TTL_SECONDS: 1_209_600,
      WEBHOOK_RAW_TTL_DAYS: 7,
      REDIS_URL: "redis://localhost:6379",
    });
  });

  it("parses provided values", () => {
    const env = validateEnv({
      DATABASE_URL,
      PORT: "8080",
      HOST: "127.0.0.1",
      NODE_ENV: "test",
      CORS_ORIGIN: "https://example.com",
      LOG_LEVEL: "debug",
      JWT_SECRET: "x".repeat(32),
      AUTH_ACCESS_TTL_SECONDS: "60",
      WEBHOOK_RAW_TTL_DAYS: "0",
    });

    expect(env.PORT).toBe(8080);
    expect(env.HOST).toBe("127.0.0.1");
    expect(env.NODE_ENV).toBe("test");
    expect(env.CORS_ORIGIN).toBe("https://example.com");
    expect(env.LOG_LEVEL).toBe("debug");
    expect(env.AUTH_ACCESS_TTL_SECONDS).toBe(60);
    expect(env.WEBHOOK_RAW_TTL_DAYS).toBe(0);
  });

  it("throws when DATABASE_URL is missing", () => {
    expect(() => validateEnv({})).toThrowError(/Invalid environment variables/);
  });

  it("throws on an invalid NODE_ENV", () => {
    expect(() =>
      validateEnv({ DATABASE_URL, NODE_ENV: "staging" }),
    ).toThrowError(/Invalid environment variables/);
  });

  it("refuses dev secret defaults in production", () => {
    expect(() =>
      validateEnv({ DATABASE_URL, NODE_ENV: "production" }),
    ).toThrowError(/JWT_SECRET, ENCRYPTION_KEY must be set explicitly/);
  });

  it("accepts explicit secrets in production", () => {
    const env = validateEnv({
      DATABASE_URL,
      NODE_ENV: "production",
      JWT_SECRET: "p".repeat(32),
      ENCRYPTION_KEY: "k".repeat(44),
    });

    expect(env.NODE_ENV).toBe("production");
    expect(env.JWT_SECRET).toBe("p".repeat(32));
  });

  it("rejects a short JWT_SECRET", () => {
    expect(() =>
      validateEnv({ DATABASE_URL, JWT_SECRET: "too-short" }),
    ).toThrowError(/Invalid environment variables/);
  });
});
