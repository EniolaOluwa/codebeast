import { spawn } from "node:child_process";

import { resolveJailed } from "./path-jail.ts";

export async function searchCode(
  root: string,
  pattern: string,
  glob?: string,
): Promise<string> {
  resolveJailed(root, ".");

  const args = [
    "--line-number",
    "--no-heading",
    "--color",
    "never",
    "--max-count",
    "50",
    ...(glob ? ["--glob", glob] : []),
    pattern,
    ".",
  ];

  return new Promise((resolve) => {
    const child = spawn("rg", args, {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      resolve(`search_code failed: ${error.message}`);
    });
    child.on("close", (code) => {
      if (code === 0 || code === 1) {
        resolve(stdout.slice(0, 32_000) || "(no matches)");
        return;
      }
      resolve(`search_code failed (exit ${code}): ${stderr.slice(0, 2_000)}`);
    });
  });
}
