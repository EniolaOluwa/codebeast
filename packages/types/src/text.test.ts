import { describe, expect, it } from "vitest";

import { byteLength, truncateToBytes, withinBytes } from "./text.ts";

describe("text helpers", () => {
  it("counts UTF-8 bytes, not characters", () => {
    expect(byteLength("abc")).toBe(3);
    expect(byteLength("åäö")).toBe(6);
    expect(byteLength("🚀")).toBe(4);
  });

  it("passes through strings within the byte budget", () => {
    expect(truncateToBytes("hello", 10)).toBe("hello");
  });

  it("truncates on a character boundary", () => {
    const input = "aaaa🚀bbbb";
    const output = truncateToBytes(input, 6);
    expect(output).toBe("aaaa");
    expect(withinBytes(6)(output)).toBe(true);
  });

  it("never splits a surrogate pair", () => {
    const output = truncateToBytes("🚀🚀🚀", 6);
    expect(output).toBe("🚀");
    expect(withinBytes(6)(output)).toBe(true);
  });

  it("returns an empty string when the budget is smaller than one char", () => {
    expect(truncateToBytes("🚀", 3)).toBe("");
  });
});
