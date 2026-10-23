import type { Prisma } from "@repo/db";

/**
 * Fixture builders shared by every integration suite. They run against a
 * given Prisma client (usually the superuser `admin` client, because fixtures
 * deliberately bypass RLS) and generate unique values so suites stay
 * independent.
 */

export type DbClient = Prisma.TransactionClient;

let counter = 0;

export function uniqueSuffix(prefix = "t"): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter}`;
}

export async function createTenantFixture(
  db: DbClient,
  overrides: { name?: string; slug?: string } = {},
): Promise<{ id: string; slug: string }> {
  const suffix = uniqueSuffix("tenant");

  return db.tenant.create({
    data: {
      name: overrides.name ?? `Tenant ${suffix}`,
      slug: overrides.slug ?? `${suffix}-slug`,
    },
    select: { id: true, slug: true },
  });
}

export async function createUserFixture(
  db: DbClient,
  overrides: { email?: string; name?: string; passwordHash?: string } = {},
): Promise<{ id: string; email: string }> {
  const suffix = uniqueSuffix("user");

  return db.user.create({
    data: {
      email: overrides.email ?? `${suffix}@example.com`,
      name: overrides.name ?? null,
      passwordHash: overrides.passwordHash ?? null,
    },
    select: { id: true, email: true },
  });
}

export async function createMembershipFixture(
  db: DbClient,
  input: {
    tenantId: string;
    userId: string;
    role?: "OWNER" | "ADMIN" | "MEMBER";
  },
): Promise<{ id: string }> {
  return db.membership.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId,
      role: input.role ?? "OWNER",
    },
    select: { id: true },
  });
}

export async function createRepositoryFixture(
  db: DbClient,
  tenantId: string,
  overrides: {
    name?: string;
    fullName?: string;
    defaultBranch?: string;
  } = {},
): Promise<{ id: string; fullName: string }> {
  const suffix = uniqueSuffix("repo");

  return db.repository.create({
    data: {
      tenantId,
      name: overrides.name ?? suffix,
      fullName: overrides.fullName ?? `acme/${suffix}`,
      defaultBranch: overrides.defaultBranch ?? "main",
    },
    select: { id: true, fullName: true },
  });
}

export async function createApiKeyFixture(
  db: DbClient,
  input: {
    tenantId: string;
    prefix?: string;
    keyHash?: string;
    scopes?: string[];
    name?: string;
  },
): Promise<{ id: string; prefix: string }> {
  const suffix = uniqueSuffix("key");

  return db.apiKey.create({
    data: {
      tenantId: input.tenantId,
      name: input.name ?? suffix,
      prefix: input.prefix ?? `cb_live_${suffix}`,
      keyHash: input.keyHash ?? `hash-${suffix}`,
      scopes: input.scopes ?? ["issues:read"],
    },
    select: { id: true, prefix: true },
  });
}

export async function createRefreshTokenFixture(
  db: DbClient,
  input: { tenantId: string; userId: string; tokenHash?: string },
): Promise<{ id: string; tokenHash: string }> {
  const suffix = uniqueSuffix("rt");

  return db.refreshToken.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId,
      tokenHash: input.tokenHash ?? `hash-${suffix}`,
      expiresAt: new Date(Date.now() + 3_600_000),
    },
    select: { id: true, tokenHash: true },
  });
}
