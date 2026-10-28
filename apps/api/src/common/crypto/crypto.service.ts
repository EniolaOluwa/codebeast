import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const VERSION = "v1";

/**
 * One place for every cryptographic primitive the API needs: AES-256-GCM for
 * secrets at rest, sha256 for high-entropy credentials (API keys, refresh
 * tokens, webhook payloads) and constant-time comparison.
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const raw = config.getOrThrow<string>("ENCRYPTION_KEY");
    const key = Buffer.from(raw, "base64");

    if (key.length !== KEY_BYTES) {
      throw new Error(
        `ENCRYPTION_KEY must decode to exactly ${KEY_BYTES} bytes (got ${key.length}); generate one with 'openssl rand -base64 32'`,
      );
    }

    this.key = key;
  }

  /** Format: `v1.<iv>.<tag>.<ciphertext>` — all base64. */
  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);

    return [
      VERSION,
      iv.toString("base64"),
      cipher.getAuthTag().toString("base64"),
      ciphertext.toString("base64"),
    ].join(".");
  }

  decrypt(payload: string): string {
    const [version, ivB64, tagB64, dataB64] = payload.split(".");

    if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) {
      throw new Error("Unrecognized ciphertext format");
    }

    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");

    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
      throw new Error("Unrecognized ciphertext format");
    }

    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }

  /** sha256 hex digest, for high-entropy values only. */
  hash(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }

  /** Constant-time equality for credentials. */
  safeEqual(left: string, right: string): boolean {
    const leftBuf = Buffer.from(left);
    const rightBuf = Buffer.from(right);

    if (leftBuf.length !== rightBuf.length) {
      return false;
    }

    return timingSafeEqual(leftBuf, rightBuf);
  }

  randomToken(bytes = 32): string {
    return randomBytes(bytes).toString("base64url");
  }
}
