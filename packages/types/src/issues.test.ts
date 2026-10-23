import { describe, expect, it } from "vitest";

import {
  MAX_ISSUE_SUMMARY_BYTES,
  MAX_STACK_FRAMES,
  issueContextSchema,
  issueSignalSchema,
} from "./issues.ts";

const validSignal = {
  id: "sig_1",
  provider: "SENTRY",
  eventType: "issue.created",
  title: "TypeError: cannot read properties of undefined",
  body: "at handleExport (src/export.ts:47:11)",
  url: "https://sentry.io/issues/1",
  actor: null,
  occurredAt: "2026-10-23T10:00:00.000Z",
};

const validContext = {
  issueId: "iss_1",
  title: "CSV export broken",
  summary: "Customer reports export button does nothing.",
  repository: { fullName: "acme/web", defaultBranch: "main" },
  signals: [validSignal],
  topFrames: [
    { file: "src/export.ts", line: 47, functionName: "handleExport" },
  ],
  enrichment: null,
};

describe("issue context bounds", () => {
  it("accepts a valid context", () => {
    expect(issueContextSchema.parse(validContext).issueId).toBe("iss_1");
  });

  it("rejects a summary over the byte budget", () => {
    const summary = "ä".repeat(MAX_ISSUE_SUMMARY_BYTES); // 2 bytes per char
    expect(
      issueContextSchema.safeParse({ ...validContext, summary }).success,
    ).toBe(false);
  });

  it("rejects more than 20 stack frames", () => {
    const topFrames = Array.from({ length: MAX_STACK_FRAMES + 1 }, (_, i) => ({
      file: `src/file-${i}.ts`,
    }));
    expect(
      issueContextSchema.safeParse({ ...validContext, topFrames }).success,
    ).toBe(false);
  });

  it("rejects a signal body over the byte budget", () => {
    expect(
      issueSignalSchema.safeParse({
        ...validSignal,
        body: "x".repeat(32_769),
      }).success,
    ).toBe(false);
  });
});
