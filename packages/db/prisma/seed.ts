import "dotenv/config";

import { createPrismaClient } from "../src/client.ts";

/**
 * Dev seed: one demo tenant, its owner, and one repository.
 *
 * Login: demo@codebeast.dev / password123.
 *
 * The hash below is scrypt (N=16384, r=8, p=1) in the exact format
 * `apps/api`'s PasswordService produces and verifies; that test suite asserts
 * this literal still verifies, so the format cannot drift silently.
 */
const DEMO_EMAIL = "demo@codebeast.dev";
const DEMO_PASSWORD_HASH =
  "scrypt$16384$8$1$UIdK59H69j2tQkrFZGUYQw$qcnuals9zP6wk-9NZfPD7GxXtIOxAKyfvXEhs5ZA4Lu3pgK2yqsNkOwEZryG1gaPQfWSnBx98dIRrscx-Gd4bw";

async function main(): Promise<void> {
  const client = createPrismaClient(process.env.DATABASE_URL!);

  try {
    const user = await client.user.upsert({
      where: { email: DEMO_EMAIL },
      update: {},
      create: {
        email: DEMO_EMAIL,
        name: "Demo Engineer",
        passwordHash: DEMO_PASSWORD_HASH,
      },
    });

    const tenant = await client.tenant.upsert({
      where: { slug: "demo" },
      update: {},
      create: { name: "Demo Co", slug: "demo" },
    });

    await client.membership.upsert({
      where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
      update: { role: "OWNER" },
      create: { tenantId: tenant.id, userId: user.id, role: "OWNER" },
    });

    await client.repository.upsert({
      where: {
        tenantId_fullName: {
          tenantId: tenant.id,
          fullName: "demo/codebeast-demo",
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        name: "codebeast-demo",
        fullName: "demo/codebeast-demo",
      },
    });

    console.info(
      `Seeded tenant '${tenant.slug}' (${tenant.id}) for ${user.email}`,
    );
  } finally {
    await client.$disconnect();
  }
}

await main();
