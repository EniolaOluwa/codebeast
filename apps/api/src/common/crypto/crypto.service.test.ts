import type { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";

import { CryptoService } from "./crypto.service.ts";

function makeService(): CryptoService {
  const config = {
    getOrThrow: (): string => "unit-test-encryption-key-that-is-long-enough",
  } as unknown as ConfigService;
  return new CryptoService(config);
}

describe("CryptoService", () => {
  it("encrypts and decrypts a round trip", () => {
    const service = makeService();
    const ciphertext = service.encrypt("ghp_super_secret_token");
    expect(ciphertext).not.toContain("ghp_super_secret_token");
    expect(service.decrypt(ciphertext)).toBe("ghp_super_secret_token");
  });

  it("uses a random IV per encryption", () => {
    const service = makeService();
    expect(service.encrypt("same")).not.toBe(service.encrypt("same"));
  });

  it("rejects a tampered payload", () => {
    const service = makeService();
    const [iv, tag, data] = service.encrypt("secret").split(":");
    const tampered = `${iv}:${tag}:${Buffer.from("hacked").toString("base64")}`;
    expect(() => service.decrypt(tampered)).toThrow();
    expect(data).toBeTruthy();
  });

  it("rejects malformed payloads", () => {
    expect(() => makeService().decrypt("nope")).toThrow(/Malformed/);
  });
});
