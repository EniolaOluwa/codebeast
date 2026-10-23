import { describe, expect, it, vi } from "vitest";

import { RuleEngine } from "./rule-engine.service.ts";

function makeHarness(
  options: {
    rules?: {
      id: string;
      conditions: unknown;
      actions: unknown;
    }[];
    issues?: {
      id: string;
      title: string;
      status: string;
      signalCount: number;
      signals: { provider: string }[];
    }[];
    rule?: { id: string; conditions: unknown } | null;
  } = {},
) {
  const tx = {
    rule: {
      findMany: vi.fn().mockResolvedValue(options.rules ?? []),
      findFirst: vi.fn().mockResolvedValue(options.rule ?? null),
    },
    issue: { findMany: vi.fn().mockResolvedValue(options.issues ?? []) },
  };

  const prisma = {
    withTenant: vi.fn(
      async (_tenantId: string, fn: (txArg: unknown) => unknown) => fn(tx),
    ),
  };

  return { engine: new RuleEngine(prisma as never), tx };
}

const subject = {
  providers: ["SENTRY"] as const,
  signalCount: 2,
  title: "Checkout 500 on Apple Pay",
};

describe("RuleEngine.matches", () => {
  const engine = makeHarness().engine;

  it("matches everything when conditions are empty", () => {
    expect(
      engine.matches({}, { ...subject, providers: [...subject.providers] }),
    ).toBe(true);
  });

  it("filters on providers, signal count and title", () => {
    expect(
      engine.matches(
        { providers: ["SLACK"] },
        { ...subject, providers: [...subject.providers] },
      ),
    ).toBe(false);
    expect(
      engine.matches(
        { providers: ["SENTRY"] },
        { ...subject, providers: [...subject.providers] },
      ),
    ).toBe(true);
    expect(
      engine.matches(
        { minSignalCount: 3 },
        { ...subject, providers: [...subject.providers] },
      ),
    ).toBe(false);
    expect(
      engine.matches(
        { titleContains: "apple pay" },
        { ...subject, providers: [...subject.providers] },
      ),
    ).toBe(true);
    expect(
      engine.matches(
        { titleContains: "avatar" },
        { ...subject, providers: [...subject.providers] },
      ),
    ).toBe(false);
  });
});

describe("RuleEngine.evaluateDetection", () => {
  it("returns the first matching enabled rule, oldest first", async () => {
    const { engine } = makeHarness({
      rules: [
        {
          id: "rule_1",
          conditions: { titleContains: "checkout" },
          actions: { action: "IGNORE" },
        },
        {
          id: "rule_2",
          conditions: {},
          actions: { action: "DETECT" },
        },
      ],
    });

    await expect(
      engine.evaluateDetection("tenant_1", {
        ...subject,
        providers: [...subject.providers],
      }),
    ).resolves.toEqual({ action: "IGNORE", ruleId: "rule_1" });
  });

  it("defaults to DETECT with no matching rules", async () => {
    const { engine } = makeHarness({
      rules: [
        {
          id: "rule_1",
          conditions: { providers: ["SLACK"] },
          actions: { action: "IGNORE" },
        },
      ],
    });

    await expect(
      engine.evaluateDetection("tenant_1", {
        ...subject,
        providers: [...subject.providers],
      }),
    ).resolves.toEqual({ action: "DETECT" });
  });

  it("skips rules with invalid stored JSON", async () => {
    const { engine } = makeHarness({
      rules: [
        { id: "bad", conditions: { minSignalCount: "nope" }, actions: {} },
      ],
    });

    await expect(
      engine.evaluateDetection("tenant_1", {
        ...subject,
        providers: [...subject.providers],
      }),
    ).resolves.toEqual({ action: "DETECT" });
  });
});

describe("RuleEngine.evaluateAutomation", () => {
  it("returns the first matching automation rule's actions", async () => {
    const { engine } = makeHarness({
      rules: [
        {
          id: "rule_9",
          conditions: { minSignalCount: 1 },
          actions: {
            createTicket: true,
            openPr: true,
            repositoryId: "repo_1",
            minConfidence: 0.5,
            dailyPrLimit: 5,
          },
        },
      ],
    });

    const decision = await engine.evaluateAutomation("tenant_1", {
      title: subject.title,
      signalCount: subject.signalCount,
    });

    expect(decision).toMatchObject({
      ruleId: "rule_9",
      actions: {
        createTicket: true,
        openPr: true,
        repositoryId: "repo_1",
        minConfidence: 0.5,
        dailyPrLimit: 5,
      },
    });
  });

  it("returns null when nothing matches", async () => {
    const { engine } = makeHarness({ rules: [] });

    await expect(
      engine.evaluateAutomation("tenant_1", {
        title: subject.title,
        signalCount: 1,
      }),
    ).resolves.toBeNull();
  });
});

describe("RuleEngine.dryRun", () => {
  it("counts the last 7 days of matching reports with a sample", async () => {
    const { engine } = makeHarness({
      rule: { id: "rule_1", conditions: { providers: ["SENTRY"] } },
      issues: [
        {
          id: "issue_1",
          title: "A",
          status: "READY",
          signalCount: 1,
          signals: [{ provider: "SENTRY" }],
        },
        {
          id: "issue_2",
          title: "B",
          status: "TICKETED",
          signalCount: 2,
          signals: [{ provider: "SENTRY" }, { provider: "SLACK" }],
        },
        {
          id: "issue_3",
          title: "C",
          status: "IGNORED",
          signalCount: 1,
          signals: [{ provider: "SLACK" }],
        },
      ],
    });

    const result = await engine.dryRun("tenant_1", "rule_1");

    expect(result).toMatchObject({
      ruleId: "rule_1",
      windowDays: 7,
      matched: 2,
    });
    expect(result.sample.map((issue) => issue.id)).toEqual([
      "issue_1",
      "issue_2",
    ]);
  });

  it("404s for unknown rules", async () => {
    const { engine } = makeHarness({ rule: null });

    await expect(engine.dryRun("tenant_1", "nope")).rejects.toThrow(
      /not found/i,
    );
  });
});
