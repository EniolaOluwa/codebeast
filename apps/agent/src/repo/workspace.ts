import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";

import type { RepositoryCheckout } from "@repo/types";

import type { Logger } from "../lib/logger.ts";

export interface WorkspaceManagerOptions {
  root: string;
  ttlMs: number;
  logger: Logger;
}

/**
 * Shallow-clone cache keyed by fullName+ref. Tokens are used for clone/fetch
 * only and never written to disk.
 */
export class WorkspaceManager {
  private readonly root: string;
  private readonly ttlMs: number;
  private readonly logger: Logger;

  constructor(options: WorkspaceManagerOptions) {
    this.root = options.root;
    this.ttlMs = options.ttlMs;
    this.logger = options.logger;
  }

  workspacePath(checkout: Pick<RepositoryCheckout, "fullName" | "ref">): string {
    const key = createHash("sha256")
      .update(`${checkout.fullName}@${checkout.ref}`)
      .digest("hex")
      .slice(0, 24);
    return path.join(this.root, key);
  }

  async ensureCheckout(checkout: RepositoryCheckout): Promise<string> {
    await mkdir(this.root, { recursive: true });
    const dir = this.workspacePath(checkout);

    if (await this.isFresh(dir)) {
      this.logger.info({ dir, fullName: checkout.fullName }, "workspace cache hit");
      return dir;
    }

    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });

    const remote = `https://x-access-token:${checkout.token}@github.com/${checkout.fullName}.git`;
    this.logger.info(
      { fullName: checkout.fullName, ref: checkout.ref },
      "cloning workspace",
    );

    await this.run("git", [
      "clone",
      "--depth",
      "1",
      "--branch",
      checkout.ref,
      remote,
      dir,
    ]);

    // Drop remote URL so the token is not left in .git/config.
    await this.run("git", ["-C", dir, "remote", "remove", "origin"]).catch(
      () => undefined,
    );

    return dir;
  }

  async readRepoAgentsMd(workspaceDir: string): Promise<string | null> {
    try {
      const { readFile } = await import("node:fs/promises");
      return await readFile(path.join(workspaceDir, "AGENTS.md"), "utf8");
    } catch {
      return null;
    }
  }

  private async isFresh(dir: string): Promise<boolean> {
    try {
      const info = await stat(path.join(dir, ".git"));
      if (!info.isDirectory() && !info.isFile()) {
        return false;
      }
      const age = Date.now() - info.mtimeMs;
      return age < this.ttlMs;
    } catch {
      return false;
    }
  }

  private run(command: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });
      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        // Never include the remote URL (which embeds the token) in errors.
        const safe = stderr
          .replace(/x-access-token:[^@\s]+@/g, "x-access-token:[redacted]@")
          .slice(0, 2_000);
        reject(new Error(`${command} exited ${code}: ${safe}`));
      });
    });
  }
}
