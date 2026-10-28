import { describe, expect, it } from "vitest";

import { redactForAudit } from "./redact.ts";

describe("redactForAudit", () => {
  it("redacts sensitive keys", () => {
    expect(
      redactForAudit({
        email: "a@b.co",
        password: "secret",
        nested: { apiToken: "tok", keep: 1 },
      }),
    ).toEqual({
      email: "a@b.co",
      password: "[redacted]",
      nested: { apiToken: "[redacted]", keep: 1 },
    });
  });

  it("truncates long strings", () => {
    const long = "x".repeat(600);
    const result = redactForAudit({ note: long }) as { note: string };
    expect(result.note.endsWith("…")).toBe(true);
    expect(result.note.length).toBeLessThan(long.length);
  });
});
