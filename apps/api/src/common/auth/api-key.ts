import { createHash, randomBytes } from "node:crypto";

const KEY_PREFIX = "cb_live";

export interface GeneratedApiKey {
  fullKey: string;
  prefix: string;
  keyHash: string;
}

export function hashApiKey(fullKey: string): string {
  return createHash("sha256").update(fullKey).digest("hex");
}

export function generateApiKey(): GeneratedApiKey {
  const prefix = randomBytes(6).toString("hex");
  const secret = randomBytes(24).toString("hex");
  const fullKey = `${KEY_PREFIX}_${prefix}_${secret}`;
  return { fullKey, prefix, keyHash: hashApiKey(fullKey) };
}

export function extractApiKeyPrefix(fullKey: string): string | null {
  const match = /^cb_live_([a-f0-9]{12})_[a-f0-9]+$/.exec(fullKey);
  return match?.[1] ?? null;
}
