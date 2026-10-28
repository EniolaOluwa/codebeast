import type { Rule } from "@repo/types";
import { describe, expect, it } from "vitest";

import { describeConditions, describeRule } from "@/lib/rules";

function rule(overrides: Partial<Rule>): Rule {
  return {
    id: "rule_1",
    kind: "DETECTION",
    name: "rule",
    enabled: true,
    conditions: {},
    actions: { action: "IGNORE" },
    createdAt: "2026-10-23T10:00:00.000Z",
    updatedAt: "2026-10-23T10:00:00.000Z",
    ...overrides,
  } as Rule;
}

describe("describeConditions", () => {
  it("reads as a plain-language subject", () => {
    expect(describeConditions({})).toBe("any report");
    expect(describeConditions({ providers: ["SENTRY"] })).toBe(
      "a Sentry report",
    );
    expect(describeConditions({ providers: ["SENTRY", "SLACK"] })).toBe(
      "a Sentry or Slack report",
    );
    expect(
      describeConditions({ minSignalCount: 3, titleContains: "spam" }),
    ).toBe('any report that has at least 3 signals and title contains "spam"');
  });
});

describe("describeRule", () => {
  it("describes detection rules", () => {
    expect(describeRule(rule({}))).toBe(
      "When any report is found, record it as ignored.",
    );
    expect(
      describeRule(
        rule({
          actions: { action: "DETECT" },
          conditions: { providers: ["JIRA"] },
        }),
      ),
    ).toBe("When a Jira report is found, keep it as a report.");
  });

  it("describes automation rules with their safety rails", () => {
    expect(
      describeRule(
        rule({
          kind: "AUTOMATION",
          actions: {
            createTicket: true,
            openPr: true,
            repositoryId: "repo_1",
            minConfidence: 0.7,
            dailyPrLimit: 5,
          },
        }),
        { repositoryName: "acme/web" },
      ),
    ).toBe(
      "When any report is ready, create a Jira ticket and open a PR ready for review in acme/web, min confidence 70%, max 5/day.",
    );
  });

  it("handles ticket-only automation", () => {
    expect(
      describeRule(
        rule({
          kind: "AUTOMATION",
          actions: { createTicket: true, openPr: false },
        }),
      ),
    ).toBe("When any report is ready, create a Jira ticket.");
  });
});
