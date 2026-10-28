import type { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";

import { CryptoService } from "./crypto.service.ts";

const KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

function makeService(key = KEY): CryptoService {
  const config = {
    getOrThrow: (): string => key,
  } as unknown as ConfigService;

  return new CryptoService(config);
}

describe("CryptoService", () => {
  it("round-trips a plaintext through encrypt/decrypt", () => {
    const service = makeService();
    const plaintext = '{"signingSecret":"whsec_1234","emoji":"🚀"}';

    expect(service.decrypt(service.encrypt(plaintext))).toBe(plaintext);
  });

  it("uses a fresh IV per encryption", () => {
    const service = makeService();

    expect(service.encrypt("same")).not.toBe(service.encrypt("same"));
  });

  it("rejects tampered ciphertext (GCM auth tag)", () => {
    const service = makeService();
    const [version, iv, tag, data] = service.encrypt("hello").split(".");

    const flipped = [
      version,
      iv,
      tag,
      (data!.startsWith("A") ? "B" : "A") + data!.slice(1),
    ].join(".");

    expect(() => service.decrypt(flipped)).toThrow();
  });

  it("rejects ciphertext encrypted with a different key", () => {
    const otherKey = Buffer.from("z".repeat(32)).toString("base64");
    const other = makeService(otherKey);

    expect(() => makeService().decrypt(other.encrypt("hello"))).toThrow();
  });

  it("rejects malformed payloads", () => {
    const service = makeService();

    expect(() => service.decrypt("not-a-payload")).toThrow(
      /Unrecognized ciphertext format/,
    );
    expect(() => service.decrypt("v2.a.b.c")).toThrow(
      /Unrecognized ciphertext format/,
    );
  });

  it("rejects a key that does not decode to 32 bytes", () => {
    expect(() => makeService("c2hvcnQ=")).toThrow(/32 bytes/);
  });

  it("hashes deterministically with sha256", () => {
    const service = makeService();

    expect(service.hash("cb_live_abc_secret")).toBe(
      service.hash("cb_live_abc_secret"),
    );
    expect(service.hash("a")).toHaveLength(64);
    expect(service.hash("a")).not.toBe(service.hash("b"));
  });

  it("compares strings without early exit on mismatched lengths", () => {
    const service = makeService();

    expect(service.safeEqual("secret", "secret")).toBe(true);
    expect(service.safeEqual("secret", "secreT")).toBe(false);
    expect(service.safeEqual("secret", "secret-longer")).toBe(false);
  });

  it("generates url-safe random tokens", () => {
    const service = makeService();
    const token = service.randomToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(service.randomToken()).not.toBe(token);
  });
});
