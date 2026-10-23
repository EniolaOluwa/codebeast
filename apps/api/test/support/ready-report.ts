import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { expect } from "vitest";

import type { RunOrchestrator } from "../../src/modules/runs/run-orchestrator.service.ts";
import type { TestDatabase } from "./database.ts";
import {
  createIssueFixture,
  createRepositoryFixture,
  createSignalFixture,
  uniqueSuffix,
} from "./factories.ts";
import type { InMemoryQueue } from "./in-memory-queue.ts";
import { drainQueue } from "./in-memory-queue.ts";

export interface ReadyReportSeed {
  tenantId: string;
  issueId: string;
  runId: string;
  auth: { authorization: string };
  repositoryFullName: string;
}

/**
 * Registers a tenant through the API, seeds a report with a linked
 * repository, and drives one compute run to READY through the real
 * orchestrator. Shared by the delivery and Jira suites.
 */
export async function seedReadyReport(input: {
  app: NestFastifyApplication;
  db: TestDatabase;
  queue: InMemoryQueue;
  orchestrator: RunOrchestrator;
  repositoryFullName?: string;
}): Promise<ReadyReportSeed> {
  const { app, db, queue, orchestrator } = input;

  const email = `${uniqueSuffix("ready")}@example.com`;
  const register = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: { email, password: "password123" },
  });
  expect(register.statusCode).toBe(201);
  const accessToken: string = register.json().accessToken;
  const auth = { authorization: `Bearer ${accessToken}` };

  const me = await app.inject({
    method: "GET",
    url: "/v1/auth/me",
    headers: auth,
  });
  const tenantId: string = me.json().tenantId;

  const repository = await createRepositoryFixture(db.admin, tenantId, {
    fullName: input.repositoryFullName ?? `acme/${uniqueSuffix("web")}`,
  });
  const issue = await createIssueFixture(db.admin, tenantId);
  await createSignalFixture(db.admin, { tenantId, issueId: issue.id });
  await db.admin.issue.update({
    where: { id: issue.id },
    data: { repositoryId: repository.id },
  });

  await orchestrator.handleIngest({ tenantId, issueId: issue.id });
  await drainQueue(queue, orchestrator);

  const run = await db.admin.run.findFirstOrThrow({
    where: { issueId: issue.id },
  });
  expect(run.status).toBe("SUCCEEDED");

  return {
    tenantId,
    issueId: issue.id,
    runId: run.id,
    auth,
    repositoryFullName: repository.fullName,
  };
}
