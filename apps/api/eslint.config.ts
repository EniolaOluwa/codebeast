import baseConfig from "@repo/eslint-config/base";
import nodeConfig from "@repo/eslint-config/node";

export default [
  { ignores: ["dist/", "node_modules/"] },
  ...baseConfig,
  ...nodeConfig,
  {
    files: ["src/**/*.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "off",
      "n/no-unsupported-features/node-builtins": "off",
    },
  },
  {
    files: ["src/main.ts"],
    rules: {
      "n/no-process-exit": "off",
    },
  },
];
