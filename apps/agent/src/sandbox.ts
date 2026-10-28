import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { PatchSubmission } from "@repo/types";

import type { Env } from "./config/env.schema.ts";
import type { Logger } from "./lib/logger.ts";
import { applyPatch } from "./patch/apply.ts";

export interface SandboxRunResult {
  sandboxRunId: string;
  exitCode: number;
  output: string;
  durationMs: number;
  lintPassed: boolean;
  typesPassed: boolean;
  testsPassed: boolean;
}

export interface SandboxOptions {
  env: Env;
  logger: Logger;
  dockerBin?: string;
}

/**
 * Copy workspace → temp dir, apply patch, run validation inside Docker.
 */
export class Sandbox {
  private readonly env: Env;
  private readonly logger: Logger;
  private readonly dockerBin: string;
  private readonly scriptPath: string;

  constructor(options: SandboxOptions) {
    this.env = options.env;
    this.logger = options.logger;
    this.dockerBin = options.dockerBin ?? "docker";
    this.scriptPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "sandbox",
      "run-validation.sh",
    );
  }

  async run(input: {
    workspaceDir: string;
    patch: PatchSubmission;
  }): Promise<SandboxRunResult> {
    const sandboxRunId = randomUUID();
    const started = Date.now();
    const work = await mkdtemp(path.join(tmpdir(), "cb-sandbox-"));

    try {
      await copyTree(input.workspaceDir, work, {
        skipDirName: ".git",
      });
      await applyPatch(work, input.patch);

      const scriptDest = path.join(work, ".codebeast-run-validation.sh");
      await copyFile(this.scriptPath, scriptDest);
      await writeFile(
        path.join(work, ".codebeast-sandbox-id"),
        sandboxRunId,
        "utf8",
      );

      const { exitCode, output } = await this.dockerRun(work);
      const durationMs = Date.now() - started;
      const flags = parseResultFlags(output);

      return {
        sandboxRunId,
        exitCode,
        output: output.slice(0, 65_536),
        durationMs,
        lintPassed: flags.lint,
        typesPassed: flags.types,
        testsPassed: flags.test,
      };
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private dockerRun(
    workDir: string,
  ): Promise<{ exitCode: number; output: string }> {
    const args = [
      "run",
      "--rm",
      "--network",
      "none",
      "-v",
      `${workDir}:/workspace:rw`,
      "-w",
      "/workspace",
      this.env.SANDBOX_IMAGE,
      "bash",
      ".codebeast-run-validation.sh",
    ];

    this.logger.info(
      { image: this.env.SANDBOX_IMAGE, sandbox: true },
      "starting sandbox",
    );

    return new Promise((resolve) => {
      const child = spawn(this.dockerBin, args, {
        stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      const append = (chunk: Buffer) => {
        output += chunk.toString("utf8");
        if (output.length > 70_000) {
          output = output.slice(-65_536);
        }
      };
      child.stdout.on("data", append);
      child.stderr.on("data", append);

      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        output += "\nERRORED: sandbox timeout\n";
      }, this.env.SANDBOX_TIMEOUT_MS);

      child.on("error", (error) => {
        clearTimeout(timer);
        resolve({
          exitCode: 2,
          output: `ERRORED: docker failed: ${error.message}\n${output}`,
        });
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ exitCode: code ?? 2, output });
      });
    });
  }
}

function parseResultFlags(output: string): {
  lint: boolean;
  types: boolean;
  test: boolean;
} {
  const match = output.match(
    /SANDBOX_RESULT lint=(\d) types=(\d) test=(\d)/,
  );
  if (!match) {
    return { lint: false, types: false, test: false };
  }
  return {
    lint: match[1] === "1",
    types: match[2] === "1",
    test: match[3] === "1",
  };
}

/** Ensure a local directory exists for unit tests that skip Docker. */
export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

async function copyTree(
  source: string,
  destination: string,
  options: { skipDirName?: string } = {},
): Promise<void> {
  await mkdir(destination, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    if (options.skipDirName && entry.name === options.skipDirName) {
      continue;
    }

    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      await copyTree(from, to, options);
      continue;
    }

    if (entry.isSymbolicLink()) {
      continue;
    }

    const info = await stat(from);
    if (info.isFile()) {
      await copyFile(from, to);
    }
  }
}
