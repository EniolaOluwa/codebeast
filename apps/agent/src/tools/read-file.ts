import { readFile } from "node:fs/promises";

import { resolveJailed } from "./path-jail.ts";

const MAX_BYTES = 64_000;

export async function readFileTool(
  root: string,
  relativePath: string,
  start?: number,
  end?: number,
): Promise<string> {
  const absolute = resolveJailed(root, relativePath);
  const content = await readFile(absolute, "utf8");
  const lines = content.split("\n");
  const from = Math.max(1, start ?? 1);
  const to = Math.min(lines.length, end ?? lines.length);
  const slice = lines.slice(from - 1, to);
  const numbered = slice
    .map((line, index) => `${from + index}|${line}`)
    .join("\n");

  if (Buffer.byteLength(numbered, "utf8") > MAX_BYTES) {
    return `${numbered.slice(0, MAX_BYTES)  }\n…[truncated]`;
  }

  return numbered;
}
