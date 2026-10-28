import { describe, expect, it } from "vitest";

import { findDeniedPaths, isDeniedPath } from "./denylist.ts";

describe("isDeniedPath", () => {
  it("blocks migrations and lockfiles", () => {
    expect(isDeniedPath("packages/db/prisma/migrations/1/migration.sql")).toBe(
      true,
    );
    expect(isDeniedPath("pnpm-lock.yaml")).toBe(true);
    expect(isDeniedPath(".env")).toBe(true);
    expect(isDeniedPath("src/export.ts")).toBe(false);
  });

  it("finds denied entries in a list", () => {
    expect(
      findDeniedPaths(["src/a.ts", ".github/workflows/ci.yml", "b.ts"]),
    ).toEqual([".github/workflows/ci.yml"]);
  });
});
