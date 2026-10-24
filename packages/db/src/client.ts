import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/prisma/client.ts";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export function createPrismaClient(connectionString: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

function createDefaultPrismaClient(): PrismaClient {
  return createPrismaClient(process.env.DATABASE_URL!);
}

export const prisma = globalForPrisma.prisma ?? createDefaultPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
