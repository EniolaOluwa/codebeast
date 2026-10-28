import baseConfig from "@repo/eslint-config/base";
import nodeConfig from "@repo/eslint-config/node";

export default [
  { ignores: ["dist/", "node_modules/", "test/fixtures/"] },
  ...baseConfig,
  ...nodeConfig,
  {
    files: ["src/main.ts"],
    rules: {
      "n/no-process-exit": "off",
    },
  },
];
