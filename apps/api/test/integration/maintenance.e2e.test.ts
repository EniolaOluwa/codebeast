import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { RawPayloadJanitor } from "../../src/modules/maintenance/raw-payload-janitor.service.ts";
import { StalledRunReaper } from "../../src/modules/maintenance/stalled-run-reaper.service.ts";
import { QUEUE_PUBLISHER } from "../../src/queues/queue.types.ts";
import { createTestApp } from "../support/app.ts";
import { getTestDatabase, type TestDatabase } from "../support/database.ts";
import { dockerAvailable } from "../support/docker.ts";
import {
  createIssueFixture,
  createTenantFixture,
  uniqueSuffix,
} from "../support/factories.ts";
import { InMemoryQueue } from "../support/in-memory-queue.ts";

describe.runIf(dockerAvailable)("maintenance (e2e)", () => {
  let db: TestDatabase;
  let app: NestFastifyApplication;
  const queue = new InMemoryQueue();

  beforeAll(async () => {
    db = await getTestDatabase();
    app = await createTestApp({
      client: db.app,
      override: (builder) =>
        builder.overrideProvider(QUEUE_PUBLISHER).useValue(queue),
    });
  });

  afterAll(async () => {
    await app.close();
    await db.admin.$disconnect();
    await db.app.$disconnect();
  });

  beforeEach(() => {
    queue.reset();
  });

  it("reaps a backdated active run as codebeast_app", async () => {
    const tenant = await createTenantFixture(db.admin);
    const issue = await createIssueFixture(db.admin, tenant.id);
    const run = await db.admin.run.create({
      data: {
        tenantId: tenant.id,
        issueId: issue.id,
        status: "PLANNING",
        attempt: 1,
        maxAttempts: 3,
        replans: 0,
      },
    });

    // Backdate updatedAt past the stall threshold.
    await db.admin.$executeRaw`
      UPDATE "Run"
      SET "updatedAt" = NOW() - INTERVAL '2 hours'
      WHERE id = ${run.id}
    `;

    const reaper = app.get(StalledRunReaper);
    const result = await reaper.run();

    expect(result.requeued).toBeGreaterThanOrEqual(1);

    const updated = await db.admin.run.findUnique({ where: { id: run.id } });
    expect(updated?.status).toBe("PLANNING");
    expect(updated?.attempt).toBe(2);
    expect(updated?.lastError).toBe("stalled");

    expect(
      queue.history.some(
        (entry) =>
          entry.queue === "plan" && entry.jobId?.includes(run.id) === true,
      ),
    ).toBe(true);

    const audit = await db.admin.auditLog.findFirst({
      where: { tenantId: tenant.id, action: "run.stalled.requeue" },
    });
    expect(audit?.actorType).toBe("SYSTEM");
    expect(audit?.targetId).toBe(run.id);
  });

  it("fails a stalled run that has exhausted attempts", async () => {
    const tenant = await createTenantFixture(db.admin);
    const issue = await createIssueFixture(db.admin, tenant.id);
    const run = await db.admin.run.create({
      data: {
        tenantId: tenant.id,
        issueId: issue.id,
        status: "CODING",
        attempt: 3,
        maxAttempts: 3,
        replans: 0,
      },
    });

    await db.admin.$executeRaw`
      UPDATE "Run"
      SET "updatedAt" = NOW() - INTERVAL '2 hours'
      WHERE id = ${run.id}
    `;

    const reaper = app.get(StalledRunReaper);
    const result = await reaper.run();
    expect(result.failed).toBeGreaterThanOrEqual(1);

    const updated = await db.admin.run.findUnique({ where: { id: run.id } });
    expect(updated?.status).toBe("ESCALATED");
  });

  it("purges expired raw payloads and keeps unexpired ones", async () => {
    const suffix = uniqueSuffix("wh");
    const expired = await db.admin.webhookEvent.create({
      data: {
        provider: "SLACK",
        externalId: `expired-${suffix}`,
        payloadHash: `hash-expired-${suffix}`,
        rawPayload: { hello: "expired" },
        rawPayloadExpiresAt: new Date(Date.now() - 60_000),
        status: "PROCESSED",
      },
    });
    const keep = await db.admin.webhookEvent.create({
      data: {
        provider: "SLACK",
        externalId: `keep-${suffix}`,
        payloadHash: `hash-keep-${suffix}`,
        rawPayload: { hello: "keep" },
        rawPayloadExpiresAt: new Date(Date.now() + 86_400_000),
        status: "PROCESSED",
      },
    });

    const janitor = app.get(RawPayloadJanitor);
    const result = await janitor.run();
    expect(result.purged).toBeGreaterThanOrEqual(1);

    const expiredRow = await db.admin.webhookEvent.findUnique({
      where: { id: expired.id },
    });
    const keepRow = await db.admin.webhookEvent.findUnique({
      where: { id: keep.id },
    });

    expect(expiredRow?.rawPayload).toBeNull();
    expect(keepRow?.rawPayload).toEqual({ hello: "keep" });
  });
});
