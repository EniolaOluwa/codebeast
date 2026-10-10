export default {
  "apps/api/**/*.{ts,tsx}": [
    "bash -c 'pnpm --filter @repo/api lint'",
    "prettier --write",
  ],
  "apps/web/**/*.{ts,tsx}": [
    "bash -c 'pnpm --filter @repo/web lint'",
    "prettier --write",
  ],
  "packages/**/*.{ts,tsx}": ["prettier --write"],
  "*.{json,md,yml,yaml}": ["prettier --write"],
};
