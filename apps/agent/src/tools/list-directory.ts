import { readdir } from "node:fs/promises";
import path from "node:path";

import { resolveJailed } from "./path-jail.ts";

export async function listDirectory(
  root: string,
  relativePath = ".",
): Promise<string> {
  const absolute = resolveJailed(root, relativePath);
  const entries = await readdir(absolute, { withFileTypes: true });
  const lines = entries
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => {
      const kind = entry.isDirectory() ? "dir" : "file";
      return `${kind}\t${path.posix.join(relativePath === "." ? "" : relativePath, entry.name) || entry.name}`;
    });
  return lines.join("\n") || "(empty)";
}
