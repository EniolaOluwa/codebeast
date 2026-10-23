import { randomBytes } from "node:crypto";

/**
 * Generates an id the application can know *before* inserting a row. Needed
 * where RLS requires the tenant claim to be set in the same transaction as
 * the insert (e.g. creating a brand-new tenant).
 */
export function newId(): string {
  return randomBytes(16).toString("base64url");
}

/** URL-safe slug with a random suffix; collisions are vanishingly rare. */
export function newSlug(base: string): string {
  const cleaned = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);

  return `${cleaned || "tenant"}-${randomBytes(3).toString("hex")}`;
}
