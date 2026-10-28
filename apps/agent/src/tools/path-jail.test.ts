import { describe, expect, it } from "vitest";

import { PathJailError, resolveJailed } from "./path-jail.ts";

describe("resolveJailed", () => {
  it("allows relative paths under root", () => {
    expect(resolveJailed("/tmp/ws", "src/a.ts")).toBe("/tmp/ws/src/a.ts");
  });

  it("rejects parent traversal", () => {
    expect(() => resolveJailed("/tmp/ws", "../etc/passwd")).toThrow(
      PathJailError,
    );
  });
});
