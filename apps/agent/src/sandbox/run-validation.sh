#!/usr/bin/env bash
# Runs inside the sandbox container at the repo root.
set -euo pipefail

detect_pm() {
  if [[ -f pnpm-lock.yaml ]]; then
    echo pnpm
  elif [[ -f yarn.lock ]]; then
    echo yarn
  elif [[ -f package-lock.json ]]; then
    echo npm
  else
    echo npm
  fi
}

has_script() {
  local name="$1"
  node -e "const p=require('./package.json'); process.exit(p.scripts && p.scripts['$name'] ? 0 : 1)" 2>/dev/null
}

PM="$(detect_pm)"

if [[ ! -f package.json ]]; then
  echo "ERRORED: no package.json at repo root" >&2
  exit 2
fi

case "$PM" in
  pnpm)
    corepack enable >/dev/null 2>&1 || true
    corepack prepare pnpm@9.15.0 --activate >/dev/null 2>&1 || true
    pnpm install --frozen-lockfile || pnpm install
    RUN_PREFIX=(pnpm run)
    ;;
  yarn)
    yarn install --frozen-lockfile || yarn install
    RUN_PREFIX=(yarn)
    ;;
  npm)
    npm ci || npm install
    RUN_PREFIX=(npm run)
    ;;
esac

LINT_OK=1
TYPES_OK=1
TEST_OK=1
RAN_ANY=0

if has_script lint; then
  RAN_ANY=1
  if ! "${RUN_PREFIX[@]}" lint; then
    LINT_OK=0
  fi
fi

if has_script check-types; then
  RAN_ANY=1
  if ! "${RUN_PREFIX[@]}" check-types; then
    TYPES_OK=0
  fi
elif has_script typecheck; then
  RAN_ANY=1
  if ! "${RUN_PREFIX[@]}" typecheck; then
    TYPES_OK=0
  fi
fi

if has_script test; then
  RAN_ANY=1
  if ! "${RUN_PREFIX[@]}" test; then
    TEST_OK=0
  fi
fi

if [[ "$RAN_ANY" -eq 0 ]]; then
  echo "ERRORED: no lint/check-types/test scripts found" >&2
  exit 2
fi

echo "SANDBOX_RESULT lint=$LINT_OK types=$TYPES_OK test=$TEST_OK"

if [[ "$LINT_OK" -eq 1 && "$TYPES_OK" -eq 1 && "$TEST_OK" -eq 1 ]]; then
  exit 0
fi
exit 1
