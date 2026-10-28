import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { PatchSubmission } from "@repo/types";

import { findDeniedPaths } from "./denylist.ts";

export class PatchApplyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PatchApplyError";
  }
}

/**
 * Apply a patch under `root`. Enforces deny-list and byte-identical oldContent.
 */
export async function applyPatch(
  root: string,
  patch: PatchSubmission,
): Promise<void> {
  const denied = findDeniedPaths(patch.changes.map((c) => c.path));
  if (denied.length > 0) {
    throw new PatchApplyError(`deny-listed paths: ${denied.join(", ")}`);
  }

  for (const change of patch.changes) {
    const absolute = resolveInsideRoot(root, change.path);

    let existing = "";
    try {
      existing = await readFile(absolute, "utf8");
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        (error as NodeJS.ErrnoException).code !== "ENOENT"
      ) {
        throw error;
      }
      // New file: oldContent must be empty.
    }

    if (existing !== change.oldContent) {
      throw new PatchApplyError(
        `oldContent mismatch for ${change.path}: file does not match expected content`,
      );
    }

    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, change.newContent, "utf8");
  }
}

export function resolveInsideRoot(root: string, relativePath: string): string {
  const normalized = relativePath.replaceAll("\\", "/");
  if (
    normalized.startsWith("/") ||
    normalized.includes("..") ||
    path.isAbsolute(normalized)
  ) {
    throw new PatchApplyError(`path escapes workspace: ${relativePath}`);
  }

  const absolute = path.resolve(root, normalized);
  const rootResolved = path.resolve(root);
  if (
    absolute !== rootResolved &&
    !absolute.startsWith(rootResolved + path.sep)
  ) {
    throw new PatchApplyError(`path escapes workspace: ${relativePath}`);
  }

  return absolute;
}
