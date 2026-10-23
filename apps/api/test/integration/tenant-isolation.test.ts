import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { bindPrismaService } from "../support/app.ts";
import { getTestDatabase, type TestDatabase } from "../support/database.ts";
import { dockerAvailable } from "../support/docker.ts";
import {
  createApiKeyFixture,
  createMembershipFixture,
  createRefreshTokenFixture,
  createRepositoryFixture,
  createTenantFixture,
  createUserFixture,
} from "../support/factories.ts";

import {
  PrismaService,
  RLS_CONTEXT,
  type RlsContext,
} from "../../src/prisma/prisma.service.ts";

/**
 * The Phase 1 acceptance gate: with the non-superuser `codebeast_app` role,
 * a cross-tenant read returns empty and unset context fails closed
 * (errors.md E-002 — superusers would bypass RLS, so this suite never uses
 * the admin client for assertions).
 */
describe.runIf(dockerAvailable)("tenant isolation (RLS)", () => {
  let db: TestDatabase;
  let service: PrismaService;

  beforeAll(async () => {
    db = await getTestDatabase();
    service = bindPrismaService(db.app);
  });

  afterAll(async () => {
    await db.admin.$disconnect();
    await db.app.$disconnect();
  });

  it("returns nothing without a tenant context", async () => {
    const tenant = await createTenantFixture(db.admin);
    await createRepositoryFixture(db.admin, tenant.id);

    const rows = await db.app.repository.findMany();
    expect(rows).toHaveLength(0);
  });

  it("sees only the active tenant's rows", async () => {
    const tenantA = await createTenantFixture(db.admin);
    const tenantB = await createTenantFixture(db.admin);
    const repoA = await createRepositoryFixture(db.admin, tenantA.id);
    const repoB = await createRepositoryFixture(db.admin, tenantB.id);

    await service.withTenant(tenantA.id, async (tx) => {
      const rows = await tx.repository.findMany();
      expect(rows.map((row) => row.id)).toEqual([repoA.id]);

      const crossTenant = await tx.repository.findUnique({
        where: { id: repoB.id },
      });
      expect(crossTenant).toBeNull();
    });
  });

  it("rejects a cross-tenant insert (WITH CHECK)", async () => {
    const tenantA = await createTenantFixture(db.admin);
    const tenantB = await createTenantFixture(db.admin);

    await expect(
      service.withTenant(tenantA.id, async (tx) =>
        tx.repository.create({
          data: {
            tenantId: tenantB.id,
            name: "sneaky",
            fullName: "evil/sneaky",
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it("resolves the acting tenant from the tenant claim", async () => {
    const tenant = await createTenantFixture(db.admin);

    const found = await service.withRls(
      { [RLS_CONTEXT.TENANT]: tenant.id },
      async (tx) => tx.tenant.findUnique({ where: { id: tenant.id } }),
    );
    expect(found?.id).toBe(tenant.id);
  });

  it("resolves an API key by prefix claim before a tenant exists", async () => {
    const tenant = await createTenantFixture(db.admin);
    const key = await createApiKeyFixture(db.admin, { tenantId: tenant.id });

    const found = await service.withRls(
      { [RLS_CONTEXT.API_KEY_PREFIX]: key.prefix },
      async (tx) => tx.apiKey.findUnique({ where: { prefix: key.prefix } }),
    );
    expect(found?.id).toBe(key.id);

    const wrongClaim = await service.withRls(
      { [RLS_CONTEXT.API_KEY_PREFIX]: "cb_live_not_this_one" },
      async (tx) => tx.apiKey.findUnique({ where: { prefix: key.prefix } }),
    );
    expect(wrongClaim).toBeNull();
  });

  it("requires the tenant claim for writes even under a user claim (revocation path)", async () => {
    const tenant = await createTenantFixture(db.admin);
    const user = await createUserFixture(db.admin);
    await createMembershipFixture(db.admin, {
      tenantId: tenant.id,
      userId: user.id,
    });
    await createRefreshTokenFixture(db.admin, {
      tenantId: tenant.id,
      userId: user.id,
    });

    const revoke = (claims: RlsContext) =>
      service.withRls(claims, async (tx) =>
        tx.refreshToken.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      );

    // User claim alone: rows are visible, but WITH CHECK rejects the write.
    await expect(revoke({ [RLS_CONTEXT.USER]: user.id })).rejects.toThrow();

    // Tenant + user claims: the revocation succeeds.
    const result = await revoke({
      [RLS_CONTEXT.TENANT]: tenant.id,
      [RLS_CONTEXT.USER]: user.id,
    });
    expect(result.count).toBe(1);
  });

  it("resolves a user's memberships with the user claim (login path)", async () => {
    const tenant = await createTenantFixture(db.admin);
    const user = await createUserFixture(db.admin);
    await createMembershipFixture(db.admin, {
      tenantId: tenant.id,
      userId: user.id,
    });

    const memberships = await service.withRls(
      { [RLS_CONTEXT.USER]: user.id },
      async (tx) => tx.membership.findMany({ where: { userId: user.id } }),
    );
    expect(memberships).toHaveLength(1);

    const withoutClaim = await service.withRls(
      { [RLS_CONTEXT.USER]: "some-other-user" },
      async (tx) => tx.membership.findMany({ where: { userId: user.id } }),
    );
    expect(withoutClaim).toHaveLength(0);
  });
});
