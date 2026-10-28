import { normalizedSignalSchema } from "@repo/types";
import { describe, expect, it, vi } from "vitest";

import { SignalIngestService } from "./signal-ingest.service.ts";

function makeSignal(externalId: string) {
  return normalizedSignalSchema.parse({
    provider: "JIRA",
    externalId,
    eventType: "jira.scan",
    title: `Signal ${externalId}`,
    body: "body",
    url: null,
    actor: null,
    occurredAt: "2026-10-23T10:00:00.000Z",
    correlationKey: `jira:issue:${externalId}`,
    repositoryHint: null,
  });
}

function makeHarness() {
  const correlation = {
    correlate: vi.fn(
      async (
        _tx: unknown,
        _tenantId: string,
        signal: { externalId: string },
      ): Promise<{
        issueId: string;
        signalId: string | null;
        issueCreated: boolean;
        signalAttached: boolean;
      }> => ({
        issueId: `issue-${signal.externalId}`,
        signalId: `signal-${signal.externalId}`,
        issueCreated: true,
        signalAttached: true,
      }),
    ),
  };

  const tx = { issue: { update: vi.fn().mockResolvedValue({}) } };

  const prisma = {
    withTenant: vi.fn(async (_tenantId: string, fn: (tx: unknown) => unknown) =>
      fn(tx),
    ),
  };

  const jobs: { queue: string; payload: unknown }[] = [];
  const publisher = {
    publish: vi.fn(async (queue: string, payload: unknown) => {
      jobs.push({ queue, payload });
    }),
  };

  const ruleEngine = {
    evaluateDetection: vi.fn().mockResolvedValue({ action: "DETECT" as const }),
  };

  const service = new SignalIngestService(
    prisma as never,
    correlation as never,
    ruleEngine as never,
    publisher as never,
  );

  return { service, correlation, ruleEngine, jobs, tx };
}

describe("SignalIngestService", () => {
  it("correlates each signal and enqueues one ingest job per signal", async () => {
    const { service, correlation, jobs } = makeHarness();

    const outcomes = await service.ingest("tenant_1", [
      makeSignal("ENG-1"),
      makeSignal("ENG-2"),
    ]);

    expect(correlation.correlate).toHaveBeenCalledTimes(2);
    expect(outcomes).toHaveLength(2);
    expect(jobs).toEqual([
      {
        queue: "ingest",
        payload: {
          tenantId: "tenant_1",
          issueId: "issue-ENG-1",
          signalId: "signal-ENG-1",
        },
      },
      {
        queue: "ingest",
        payload: {
          tenantId: "tenant_1",
          issueId: "issue-ENG-2",
          signalId: "signal-ENG-2",
        },
      },
    ]);
  });

  it("omits signalId when no signal row exists for the delivery", async () => {
    const { service, correlation, jobs } = makeHarness();

    correlation.correlate.mockResolvedValue({
      issueId: "issue-ENG-1",
      signalId: null,
      issueCreated: false,
      signalAttached: false,
    });

    await service.ingest("tenant_1", [makeSignal("ENG-1")]);

    expect(jobs[0]!.payload).toEqual({
      tenantId: "tenant_1",
      issueId: "issue-ENG-1",
    });
  });

  it("marks brand-new reports ignored when a detection rule says IGNORE", async () => {
    const { service, ruleEngine, jobs, tx } = makeHarness();

    ruleEngine.evaluateDetection.mockResolvedValue({
      action: "IGNORE",
      ruleId: "rule_1",
    });

    const outcomes = await service.ingest("tenant_1", [makeSignal("ENG-1")]);

    expect(outcomes[0]).toMatchObject({ ignoredByRule: true });
    expect(jobs).toHaveLength(0);
    expect(tx.issue.update).toHaveBeenCalledWith({
      where: { id: "issue-ENG-1" },
      data: { status: "IGNORED" },
    });
  });

  it("never gates signals that attach to an existing report", async () => {
    const { service, ruleEngine, correlation, jobs } = makeHarness();

    correlation.correlate.mockResolvedValue({
      issueId: "issue-ENG-1",
      signalId: "signal-ENG-1",
      issueCreated: false,
      signalAttached: true,
    });

    await service.ingest("tenant_1", [makeSignal("ENG-1")]);

    expect(ruleEngine.evaluateDetection).not.toHaveBeenCalled();
    expect(jobs).toHaveLength(1);
  });
});
