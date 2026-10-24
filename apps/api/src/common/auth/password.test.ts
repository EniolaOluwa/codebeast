import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password.ts";

describe("password hashing", () => {
  it("verifies the correct password", () => {
    const stored = hashPassword("correct horse battery staple");
    expect(verifyPassword("correct horse battery staple", stored)).toBe(true);
  });

  it("rejects the wrong password", () => {
    const stored = hashPassword("correct horse battery staple");
    expect(verifyPassword("wrong password", stored)).toBe(false);
  });

  it("rejects malformed stored values", () => {
    expect(verifyPassword("anything", "not-a-hash")).toBe(false);
  });

  it("produces a different salt each time", () => {
    expect(hashPassword("same")).not.toBe(hashPassword("same"));
  });
});
