import { describe, expect, it } from "vitest";

import { relativeTime } from "@/lib/format";
import {
  pullRequestChip,
  reportChip,
  severityChip,
  validationChip,
} from "@/lib/status";

describe("reportChip (design.md §8.2 status values)", () => {
  it("maps review states", () => {
    expect(reportChip("READY")).toEqual({
      label: "Needs review",
      tone: "warning",
    });
    expect(reportChip("ESCALATED")).toEqual({
      label: "Needs review",
      tone: "danger",
    });
  });

  it("maps shipped states and folds in the pull request", () => {
    expect(reportChip("TICKETED").label).toBe("Ticket created");
    expect(reportChip("PR_OPENED").label).toBe("PR open");
    expect(reportChip("PR_OPENED", { status: "MERGED" }).label).toBe("Merged");
    expect(reportChip("PR_OPENED", { status: "CLOSED" }).label).toBe(
      "PR closed",
    );
    expect(reportChip("RESOLVED").label).toBe("Resolved");
    expect(reportChip("IGNORED").label).toBe("Ignored");
    expect(reportChip("FAILED").label).toBe("Failed");
  });

  it("maps pre-compute states to in progress", () => {
    expect(reportChip("NEW").label).toBe("In progress");
    expect(reportChip("RUNNING").label).toBe("In progress");
  });
});

describe("pullRequestChip / validationChip / severityChip", () => {
  it("maps PR states", () => {
    expect(pullRequestChip("OPEN")).toEqual({ label: "Open", tone: "info" });
    expect(pullRequestChip("MERGED").tone).toBe("success");
    expect(pullRequestChip("CLOSED").tone).toBe("neutral");
  });

  it("maps validation states", () => {
    expect(validationChip("PASSED").tone).toBe("success");
    expect(validationChip("FAILED").tone).toBe("danger");
    expect(validationChip("ERRORED").tone).toBe("warning");
  });

  it("derives a severity placeholder from signal volume", () => {
    expect(severityChip(2).label).toBe("Medium");
    expect(severityChip(3).label).toBe("High");
  });
});

describe("relativeTime (design.md §11)", () => {
  it("uses relative labels under 24 hours", () => {
    const now = Date.now();
    expect(relativeTime(new Date(now - 10_000).toISOString())).toBe("just now");
    expect(relativeTime(new Date(now - 5 * 60_000).toISOString())).toBe(
      "5m ago",
    );
    expect(relativeTime(new Date(now - 3 * 3_600_000).toISOString())).toBe(
      "3h ago",
    );
  });

  it("uses absolute labels after 24 hours", () => {
    const value = relativeTime("2026-01-02T14:05:00.000Z");
    expect(value).toMatch(/Jan 2/);
    expect(value).toMatch(/\d{2}:\d{2}/);
  });
});
