import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: "typescript", decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: "es2022",
      },
      module: { type: "es6" },
    }),
  ],
  test: {
    globals: true,
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    testTimeout: 60_000,
    // Integration suites start several containers in parallel; give the
    // Docker VM room under load.
    hookTimeout: 240_000,
    env: {
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      NODE_ENV: "test",
      QUEUE_ENABLED: "false",
      JWT_SECRET: "test-secret-value-that-is-long-enough",
      // Must decode to exactly 32 bytes (same as env.schema DEV default).
      ENCRYPTION_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.d.ts",
        "src/generated/**",
        "src/main.ts",
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 60,
        statements: 60,
      },
    },
  },
});
