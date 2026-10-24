import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createPrismaClient } from "@repo/db";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const migrationsDir = fileURLToPath(
  new URL("../../../../packages/db/prisma/migrations", import.meta.url),
);

async function applyMigrations(connectionString: string): Promise<void> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const migrations = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    for (const migration of migrations) {
      const sql = readFileSync(
        join(migrationsDir, migration, "migration.sql"),
        "utf8",
      );
      await client.query(sql);
    }
  } finally {
    await client.end();
  }
}

function appConnectionString(adminUrl: string): string {
  const url = new URL(adminUrl);
  url.username = "codebeast_app";
  url.password = "codebeast_app";
  url.searchParams.set("schema", "public");
  return url.toString();
}

describe("tenant isolation (RLS)", () => {
  let container: Awaited<ReturnType<PostgreSqlContainer["start"]>>;
  let admin: ReturnType<typeof createPrismaClient>;
  let app: ReturnType<typeof createPrismaClient>;
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    const adminUrl = container.getConnectionUri();

    await applyMigrations(adminUrl);

    admin = createPrismaClient(`${adminUrl}?schema=public`);
    app = createPrismaClient(appConnectionString(adminUrl));

    const [a, b] = await Promise.all([
      admin.tenant.create({
        data: { name: "Tenant A", slug: `a-${Date.now()}` },
      }),
      admin.tenant.create({
        data: { name: "Tenant B", slug: `b-${Date.now()}` },
      }),
    ]);
    tenantA = a.id;
    tenantB = b.id;

    await admin.repository.create({
      data: {
        tenantId: tenantA,
        externalId: "1",
        fullName: "acme/a",
      },
    });
    await admin.repository.create({
      data: {
        tenantId: tenantB,
        externalId: "2",
        fullName: "acme/b",
      },
    });
  });

  afterAll(async () => {
    await admin?.$disconnect();
    await app?.$disconnect();
    await container?.stop();
  });

  it("uses a non-superuser app role", async () => {
    const rows = await admin.$queryRaw<
      { rolsuper: boolean; rolbypassrls: boolean }[]
    >`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'codebeast_app'`;

    expect(rows).toHaveLength(1);
    expect(rows[0]?.rolsuper).toBe(false);
    expect(rows[0]?.rolbypassrls).toBe(false);
  });

  it("only returns rows for the current tenant", async () => {
    const rows = await app.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantA}, true)`;
      return tx.repository.findMany({ orderBy: { fullName: "asc" } });
    });

    expect(rows.map((row) => row.fullName)).toEqual(["acme/a"]);
  });

  it("blocks inserting rows for another tenant", async () => {
    await expect(
      app.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantA}, true)`;
        await tx.repository.create({
          data: {
            tenantId: tenantB,
            externalId: "3",
            fullName: "acme/c",
          },
        });
      }),
    ).rejects.toThrow(/row-level security|violates/i);
  });

  it("does not leak rows when no tenant is set", async () => {
    const rows = await app.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant', '', true)`;
      return tx.repository.findMany();
    });

    expect(rows).toHaveLength(0);
  });
});
