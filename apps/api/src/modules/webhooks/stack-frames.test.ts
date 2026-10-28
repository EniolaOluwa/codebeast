import { MAX_STACK_FRAMES } from "@repo/types";
import { describe, expect, it } from "vitest";

import { extractStackFrames, mergeStackFrames } from "./stack-frames.ts";

describe("extractStackFrames", () => {
  it("extracts V8-style frames with function names", () => {
    const trace = [
      "TypeError: Cannot read properties of undefined",
      "    at handleExport (src/export.ts:47:11)",
      "    at processRequest (src/server.ts:12:5)",
    ].join("\n");

    expect(extractStackFrames(trace)).toEqual([
      { file: "src/export.ts", line: 47, functionName: "handleExport" },
      { file: "src/server.ts", line: 12, functionName: "processRequest" },
    ]);
  });

  it("extracts bare at file:line frames", () => {
    expect(extractStackFrames("at /app/src/jobs/worker.js:99:3")).toEqual([
      { file: "/app/src/jobs/worker.js", line: 99 },
    ]);
  });

  it("dedupes repeated frames and honors the contract cap", () => {
    const repeated = Array.from(
      { length: MAX_STACK_FRAMES + 10 },
      (_, index) => `    at fn (src/file-${index % 5}.ts:1:1)`,
    ).join("\n");

    const frames = extractStackFrames(repeated);
    expect(frames).toHaveLength(5);
    expect(frames.length).toBeLessThanOrEqual(MAX_STACK_FRAMES);
  });

  it("returns an empty list for traces without frames", () => {
    expect(extractStackFrames("just a message")).toEqual([]);
  });
});

describe("mergeStackFrames", () => {
  it("merges across texts, keeping first-seen order and dedupe", () => {
    const merged = mergeStackFrames([
      "at a (src/a.ts:1:1)",
      "at a again (src/a.ts:1:1)\n    at b (src/b.ts:2:2)",
    ]);

    expect(merged).toEqual([
      { file: "src/a.ts", line: 1, functionName: "a" },
      { file: "src/b.ts", line: 2, functionName: "b" },
    ]);
  });
});
