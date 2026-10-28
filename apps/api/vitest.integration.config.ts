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
    include: ["test/integration/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: "test",
      QUEUE_ENABLED: "false",
      JWT_SECRET: "test-secret-value-that-is-long-enough",
      ENCRYPTION_KEY: "test-encryption-key-that-is-long-enough",
    },
  },
});
