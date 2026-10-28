import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    testTimeout: 30_000,
    env: {
      NODE_ENV: "test",
      AGENT_SERVICE_TOKEN: "test-token",
      LLM_API_KEY: "test-key",
      WORKSPACE_ROOT: "/tmp/codebeast-agent-test",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.d.ts", "src/main.ts"],
      thresholds: {
        lines: 40,
        functions: 40,
        branches: 40,
        statements: 40,
      },
    },
  },
});
