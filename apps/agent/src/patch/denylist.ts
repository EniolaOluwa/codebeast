/**
 * Paths the coder may never touch (root AGENTS.md §5.1).
 * Matching patches are rejected before validation.
 */

const DENY_GLOBS: readonly RegExp[] = [
  /(^|\/)\.github(\/|$)/,
  /(^|\/)Dockerfile$/,
  /(^|\/)docker-compose\.ya?ml$/,
  /(^|\/)\.env(\.|$)/,
  /(^|\/)secrets(\/|$)/,
  /(^|\/)infra(\/|$)/,
  /(^|\/)terraform(\/|$)/,
  /(^|\/)package-lock\.json$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)packages\/db\/prisma\/migrations(\/|$)/,
  /\.pem$/,
  /\.key$/,
  /(^|\/)\.agent\/denylist$/,
];

export function isDeniedPath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "");
  return DENY_GLOBS.some((pattern) => pattern.test(normalized));
}

export function findDeniedPaths(paths: readonly string[]): string[] {
  return paths.filter(isDeniedPath);
}
