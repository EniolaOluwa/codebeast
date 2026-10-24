import { randomBytes, scryptSync } from "node:crypto";

import "dotenv/config";

import { prisma } from "../src/client.ts";

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

async function main(): Promise<void> {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo" },
    update: {},
    create: { name: "Demo", slug: "demo" },
  });

  const user = await prisma.user.upsert({
    where: { email: "demo@codebeast.app" },
    update: {},
    create: {
      email: "demo@codebeast.app",
      name: "Demo User",
      passwordHash: hashPassword("password123"),
    },
  });

  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
    update: { role: "OWNER" },
    create: { tenantId: tenant.id, userId: user.id, role: "OWNER" },
  });

  process.stdout.write(
    `Seeded tenant=${tenant.slug} user=${user.email} password=password123\n`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    await prisma.$disconnect();
    process.exit(1);
  });
