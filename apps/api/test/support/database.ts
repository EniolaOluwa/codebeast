import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { createPrismaClient } from "@repo/db";

/**
 * One disposable Postgres per test-worker process, migrated with the real
 * `prisma migrate deploy` so RLS policies and the `codebeast_app` role exist
 * exactly as in production.
 *
 * Two clients:
 * - `admin`  — superuser; bypasses RLS; use it for fixtures only.
 * - `app`    — the non-superuser role the API runs as; subject to RLS.
 *
 * Containers are intentionally not stopped by tests: Testcontainers' Ryuk
 * reaper removes them when the test process exits, and memoization lets
 * several files in one worker share a single database.
 */

export const APP_ROLE = "codebeast_app";
const APP_ROLE_PASSWORD = "codebeast_test";

export type TestPrismaClient = ReturnType<typeof createPrismaClient>;

export interface TestDatabase {
  adminUrl: string;
  appUrl: string;
  admin: TestPrismaClient;
  app: TestPrismaClient;
}

let cached: Promise<TestDatabase> | undefined;

export function getTestDatabase(): Promise<TestDatabase> {
  cached ??= startDatabase();
  return cached;
}

async function startDatabase(): Promise<TestDatabase> {
  const container = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("codebeast_test")
    .start();

  const adminUrl = container.getConnectionUri();
  runMigrations(adminUrl);

  const admin = createPrismaClient(adminUrl);

  // The migration creates the role without a password; grant one locally.
  await admin.$executeRawUnsafe(
    `ALTER ROLE ${APP_ROLE} WITH LOGIN PASSWORD '${APP_ROLE_PASSWORD}'`,
  );

  const appUrlUrl = new URL(adminUrl);
  appUrlUrl.username = APP_ROLE;
  appUrlUrl.password = APP_ROLE_PASSWORD;
  const appUrl = appUrlUrl.toString();

  const app = createPrismaClient(appUrl);

  return { adminUrl, appUrl, admin, app };
}

function runMigrations(databaseUrl: string): void {
  const supportDir = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(supportDir, "..", "..", "..", "..");
  const dbPackageDir = join(repoRoot, "packages", "db");
  const prismaBin = join(
    dbPackageDir,
    "node_modules",
    "prisma",
    "build",
    "index.js",
  );

  if (!existsSync(prismaBin)) {
    throw new Error(
      `Prisma CLI not found at ${prismaBin}; run 'corepack pnpm install' at the repo root`,
    );
  }

  execFileSync(process.execPath, [prismaBin, "migrate", "deploy"], {
    cwd: dbPackageDir,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      NODE_ENV: "test",
    },
    stdio: "pipe",
    timeout: 120_000,
  });
}
