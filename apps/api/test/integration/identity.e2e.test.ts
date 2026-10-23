import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestApp } from "../support/app.ts";
import { getTestDatabase, type TestDatabase } from "../support/database.ts";
import { dockerAvailable } from "../support/docker.ts";
import { uniqueSuffix } from "../support/factories.ts";

/**
 * Phase 2 acceptance gate: register/login/refresh (rotating)/logout/me, API
 * key scopes and revocation, member roles and last-owner protection — all
 * through the real HTTP pipeline against a real database.
 */
describe.runIf(dockerAvailable)("identity & access (e2e)", () => {
  let db: TestDatabase;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    db = await getTestDatabase();
    app = await createTestApp({ client: db.app });
  });

  afterAll(async () => {
    await app.close();
    await db.admin.$disconnect();
    await db.app.$disconnect();
  });

  async function register(prefix: string): Promise<{
    email: string;
    accessToken: string;
    refreshToken: string;
  }> {
    const email = `${uniqueSuffix(prefix)}@example.com`;
    const password = "password123";

    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { email, password, name: "Test User" },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();

    return {
      email,
      accessToken: body.accessToken,
      refreshToken: body.refreshToken,
    };
  }

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  it("registers, returns me, rotates refresh tokens and detects reuse", async () => {
    const account = await register("identity");

    const me = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: auth(account.accessToken),
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      user: { email: account.email },
      role: "OWNER",
    });

    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: account.email, password: "password123" },
    });
    expect(login.statusCode).toBe(200);
    const firstRefresh: string = login.json().refreshToken;

    const refreshed = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: { refreshToken: firstRefresh },
    });
    expect(refreshed.statusCode).toBe(200);
    const secondRefresh: string = refreshed.json().refreshToken;
    expect(secondRefresh).not.toBe(firstRefresh);

    // Presenting the rotated token again is treated as theft: 401...
    const reuse = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: { refreshToken: firstRefresh },
    });
    expect(reuse.statusCode).toBe(401);

    // ...and the whole family is revoked, including the newest token.
    const afterReuse = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: { refreshToken: secondRefresh },
    });
    expect(afterReuse.statusCode).toBe(401);
  });

  it("rejects bad credentials with the standard error envelope", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "nobody@example.com", password: "does-not-matter" },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({
      success: false,
      error: { code: "UNAUTHORIZED" },
    });
  });

  it("logs out (idempotently) and rejects the revoked token", async () => {
    const account = await register("logout");

    const logout = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      payload: { refreshToken: account.refreshToken },
    });
    expect(logout.statusCode).toBe(200);

    const replay = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      payload: { refreshToken: account.refreshToken },
    });
    expect(replay.statusCode).toBe(200);

    const refresh = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: { refreshToken: account.refreshToken },
    });
    expect(refresh.statusCode).toBe(401);
  });

  it("gates endpoints by API key scope and honors revocation", async () => {
    const account = await register("keys");

    const created = await app.inject({
      method: "POST",
      url: "/v1/api-keys",
      headers: auth(account.accessToken),
      payload: { name: "ci", scopes: ["members:read"] },
    });
    expect(created.statusCode).toBe(201);
    const apiKey: string = created.json().key;
    expect(apiKey).toMatch(/^cb_live_[0-9a-f]{8}_/);

    // Key with the right scope reads members.
    const allowed = await app.inject({
      method: "GET",
      url: "/v1/members",
      headers: auth(apiKey),
    });
    expect(allowed.statusCode).toBe(200);

    // Key without the scope is rejected.
    const other = await app.inject({
      method: "POST",
      url: "/v1/api-keys",
      headers: auth(account.accessToken),
      payload: { name: "no-scope", scopes: ["issues:read"] },
    });
    const denied = await app.inject({
      method: "GET",
      url: "/v1/members",
      headers: auth(other.json().key),
    });
    expect(denied.statusCode).toBe(403);

    // Keys cannot reach user-only endpoints (roles without scopes).
    const userOnly = await app.inject({
      method: "POST",
      url: "/v1/members",
      headers: auth(apiKey),
      payload: { email: account.email, role: "ADMIN" },
    });
    expect(userOnly.statusCode).toBe(403);

    // Revocation takes effect immediately.
    const revoked = await app.inject({
      method: "DELETE",
      url: `/v1/api-keys/${created.json().id}`,
      headers: auth(account.accessToken),
    });
    expect(revoked.statusCode).toBe(200);

    const afterRevoke = await app.inject({
      method: "GET",
      url: "/v1/members",
      headers: auth(apiKey),
    });
    expect(afterRevoke.statusCode).toBe(401);
  });

  it("manages members and protects the last owner", async () => {
    const owner = await register("owner");
    const other = await register("teammate");

    const invite = await app.inject({
      method: "POST",
      url: "/v1/members",
      headers: auth(owner.accessToken),
      payload: { email: other.email, role: "MEMBER" },
    });
    expect(invite.statusCode).toBe(201);
    const membershipId: string = invite.json().id;

    const list = await app.inject({
      method: "GET",
      url: "/v1/members",
      headers: auth(owner.accessToken),
    });
    expect(list.json().pagination.total).toBe(2);

    // Inviting the same account again conflicts.
    const duplicate = await app.inject({
      method: "POST",
      url: "/v1/members",
      headers: auth(owner.accessToken),
      payload: { email: other.email, role: "MEMBER" },
    });
    expect(duplicate.statusCode).toBe(409);

    // Inviting an unknown account fails validation.
    const unknown = await app.inject({
      method: "POST",
      url: "/v1/members",
      headers: auth(owner.accessToken),
      payload: { email: "ghost@example.com", role: "MEMBER" },
    });
    expect(unknown.statusCode).toBe(422);

    // Promoting then demoting works while another owner remains.
    const promote = await app.inject({
      method: "PATCH",
      url: `/v1/members/${membershipId}`,
      headers: auth(owner.accessToken),
      payload: { role: "OWNER" },
    });
    expect(promote.statusCode).toBe(200);

    const demoted = await app.inject({
      method: "PATCH",
      url: `/v1/members/${membershipId}`,
      headers: auth(owner.accessToken),
      payload: { role: "MEMBER" },
    });
    expect(demoted.statusCode).toBe(200);

    // Now the original owner is the last one; demotion must fail.
    const me = await app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: auth(owner.accessToken),
    });
    const ownerMembership = (
      await app.inject({
        method: "GET",
        url: "/v1/members",
        headers: auth(owner.accessToken),
      })
    )
      .json()
      .data.find(
        (member: { role: string; userId: string }) => member.role === "OWNER",
      );

    const lastOwner = await app.inject({
      method: "PATCH",
      url: `/v1/members/${ownerMembership.id}`,
      headers: auth(owner.accessToken),
      payload: { role: "MEMBER" },
    });
    expect(lastOwner.statusCode).toBe(422);
    expect(me.statusCode).toBe(200);

    // Removing the member works.
    const removed = await app.inject({
      method: "DELETE",
      url: `/v1/members/${membershipId}`,
      headers: auth(owner.accessToken),
    });
    expect(removed.statusCode).toBe(200);

    const afterRemoval = await app.inject({
      method: "GET",
      url: "/v1/members",
      headers: auth(owner.accessToken),
    });
    expect(afterRemoval.json().pagination.total).toBe(1);
  });
});
