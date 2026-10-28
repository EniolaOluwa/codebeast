import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password.ts";

/** Literal from packages/db/prisma/seed.ts — drift guard. */
const SEED_HASH =
  "scrypt$16384$8$1$UIdK59H69j2tQkrFZGUYQw$qcnuals9zP6wk-9NZfPD7GxXtIOxAKyfvXEhs5ZA4Lu3pgK2yqsNkOwEZryG1gaPQfWSnBx98dIRrscx-Gd4bw";

describe("password hashing (scrypt)", () => {
  it("round-trips a password", async () => {
    const hash = await hashPassword("correct horse battery staple");

    expect(await verifyPassword("correct horse battery staple", hash)).toBe(
      true,
    );
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("uses a fresh salt per hash", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  it("rejects malformed stored hashes", async () => {
    expect(await verifyPassword("x", "bcrypt$whatever")).toBe(false);
    expect(await verifyPassword("x", "scrypt$1$2$3$4")).toBe(false);
    expect(await verifyPassword("x", "")).toBe(false);
  });

  it("rejects absurd scrypt parameters instead of hanging (DoS guard)", async () => {
    expect(await verifyPassword("x", "scrypt$99999999$8$1$AAAA$BBBB")).toBe(
      false,
    );
  });

  it("keeps the seed literal verifiable (password123)", async () => {
    expect(await verifyPassword("password123", SEED_HASH)).toBe(true);
  });
});
