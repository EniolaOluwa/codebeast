import { describe, expect, it } from "vitest";

import { validateEnv } from "./env.schema.ts";

describe("validateEnv", () => {
  it("applies defaults and coerces PORT", () => {
    const env = validateEnv({ DATABASE_URL: "postgresql://localhost/db" });
    expect(env).toMatchObject({
      PORT: 3001,
      HOST: "0.0.0.0",
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://localhost/db",
      CORS_ORIGIN: "*",
      LOG_LEVEL: "info",
      JWT_ACCESS_TTL: 900,
      JWT_REFRESH_TTL: 2_592_000,
      REDIS_URL: "redis://localhost:6379",
      QUEUE_ENABLED: true,
    });
  });

  it("parses provided values", () => {
    const env = validateEnv({
      DATABASE_URL: "postgresql://localhost/db",
      PORT: "8080",
      HOST: "127.0.0.1",
      NODE_ENV: "production",
      CORS_ORIGIN: "https://example.com",
      LOG_LEVEL: "debug",
    });
    expect(env.PORT).toBe(8080);
    expect(env.HOST).toBe("127.0.0.1");
    expect(env.NODE_ENV).toBe("production");
    expect(env.CORS_ORIGIN).toBe("https://example.com");
    expect(env.LOG_LEVEL).toBe("debug");
  });

  it("throws when DATABASE_URL is missing", () => {
    expect(() => validateEnv({})).toThrowError(/Invalid environment variables/);
  });

  it("throws on an invalid NODE_ENV", () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: "postgresql://localhost/db",
        NODE_ENV: "staging",
      }),
    ).toThrowError(/Invalid environment variables/);
  });
});
