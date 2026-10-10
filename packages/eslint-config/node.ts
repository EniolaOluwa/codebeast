import tseslint from "typescript-eslint";
import nodePlugin from "eslint-plugin-n";
import globals from "globals";

const nodeRecommended = nodePlugin.configs["flat/recommended"];

export default tseslint.config({
  ...nodeRecommended,
  files: ["**/*.ts"],
  languageOptions: {
    ...nodeRecommended.languageOptions,
    globals: globals.node,
  },
});
