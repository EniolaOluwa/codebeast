import baseConfig from "@repo/eslint-config/base";
import nodeConfig from "@repo/eslint-config/node";

export default [
  { ignores: ["dist/", "node_modules/"] },
  ...baseConfig,
  ...nodeConfig,
  {
    files: ["src/server.ts"],
    rules: {
      "n/no-process-exit": "off",
    },
  },
];
