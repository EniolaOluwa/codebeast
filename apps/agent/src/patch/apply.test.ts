import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { applyPatch, PatchApplyError } from "./apply.ts";

describe("applyPatch", () => {
  it("applies a change when oldContent matches", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "cb-patch-"));
    await writeFile(path.join(root, "a.ts"), "old\n", "utf8");

    await applyPatch(root, {
      changes: [
        { path: "a.ts", oldContent: "old\n", newContent: "new\n" },
      ],
      commitMessage: "fix: x",
      testsToRun: [],
      rationale: "r",
    });

    expect(await readFile(path.join(root, "a.ts"), "utf8")).toBe("new\n");
  });

  it("rejects oldContent mismatch", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "cb-patch-"));
    await writeFile(path.join(root, "a.ts"), "actual\n", "utf8");

    await expect(
      applyPatch(root, {
        changes: [
          { path: "a.ts", oldContent: "expected\n", newContent: "new\n" },
        ],
        commitMessage: "fix: x",
        testsToRun: [],
        rationale: "r",
      }),
    ).rejects.toBeInstanceOf(PatchApplyError);
  });

  it("rejects deny-listed paths", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "cb-patch-"));

    await expect(
      applyPatch(root, {
        changes: [
          {
            path: ".env",
            oldContent: "",
            newContent: "SECRET=1\n",
          },
        ],
        commitMessage: "fix: x",
        testsToRun: [],
        rationale: "r",
      }),
    ).rejects.toThrow(/deny-listed/);
  });
});
