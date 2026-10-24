import { describe, expect, it } from "vitest";

import { extractApiKeyPrefix, generateApiKey, hashApiKey } from "./api-key.ts";

describe("api keys", () => {
  it("generates a parseable cb_live key", () => {
    const generated = generateApiKey();
    expect(generated.fullKey).toMatch(/^cb_live_[a-f0-9]{12}_[a-f0-9]{48}$/);
    expect(extractApiKeyPrefix(generated.fullKey)).toBe(generated.prefix);
  });

  it("hashes the full key deterministically", () => {
    const generated = generateApiKey();
    expect(hashApiKey(generated.fullKey)).toBe(generated.keyHash);
    expect(hashApiKey(`${generated.fullKey}x`)).not.toBe(generated.keyHash);
  });

  it("rejects keys with a non-hex secret", () => {
    expect(extractApiKeyPrefix("cb_live_abcdef123456_not-hex")).toBeNull();
    expect(extractApiKeyPrefix("cb_live_short_deadbeef")).toBeNull();
    expect(extractApiKeyPrefix("nope")).toBeNull();
  });
});
