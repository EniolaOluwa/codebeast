import path from "node:path";

export class PathJailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathJailError";
  }
}

export function resolveJailed(root: string, relativePath: string): string {
  const normalized = relativePath.replaceAll("\\", "/").replace(/^\.\//, "");
  if (
    normalized.startsWith("/") ||
    normalized.split("/").includes("..") ||
    path.isAbsolute(normalized)
  ) {
    throw new PathJailError(`path escapes workspace: ${relativePath}`);
  }

  const absolute = path.resolve(root, normalized || ".");
  const rootResolved = path.resolve(root);
  if (
    absolute !== rootResolved &&
    !absolute.startsWith(rootResolved + path.sep)
  ) {
    throw new PathJailError(`path escapes workspace: ${relativePath}`);
  }

  return absolute;
}
