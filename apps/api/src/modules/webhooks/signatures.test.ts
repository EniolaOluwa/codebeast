import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  githubSignature,
  sentrySignature,
  SLACK_REPLAY_WINDOW_SECONDS,
  slackSignature,
  verifyGithub,
  verifyJira,
  verifySentry,
  verifySharedSecret,
  verifySlack,
} from "./signatures.ts";

const SECRET = "whsec_test_secret";
const BODY = JSON.stringify({ hello: "world" });

describe("slack signature (v0 HMAC + replay window)", () => {
  const timestamp = "1700000000";
  const headers = {
    "x-slack-signature": slackSignature(SECRET, timestamp, BODY),
    "x-slack-request-timestamp": timestamp,
  };
  const now = Number(timestamp) * 1000 + 1000;

  it("accepts a correctly signed, fresh request", () => {
    expect(verifySlack(BODY, headers, SECRET, now)).toBe(true);
  });

  it("rejects a tampered body", () => {
    expect(verifySlack(`${BODY} `, headers, SECRET, now)).toBe(false);
  });

  it("rejects the wrong secret", () => {
    expect(verifySlack(BODY, headers, "other-secret", now)).toBe(false);
  });

  it("rejects replayed timestamps outside the window", () => {
    const stale = now + (SLACK_REPLAY_WINDOW_SECONDS + 1) * 1000;
    expect(verifySlack(BODY, headers, SECRET, stale)).toBe(false);
  });

  it("rejects missing headers", () => {
    expect(
      verifySlack(
        BODY,
        { "x-slack-signature": headers["x-slack-signature"] },
        SECRET,
        now,
      ),
    ).toBe(false);
  });
});

describe("sentry signature (hex HMAC)", () => {
  it("accepts the exact digest and rejects variants", () => {
    const signature = sentrySignature(SECRET, BODY);

    expect(
      verifySentry(BODY, { "sentry-hook-signature": signature }, SECRET),
    ).toBe(true);
    expect(
      verifySentry(`${BODY}x`, { "sentry-hook-signature": signature }, SECRET),
    ).toBe(false);
    expect(
      verifySentry(BODY, { "sentry-hook-signature": signature }, "nope"),
    ).toBe(false);
    expect(verifySentry(BODY, {}, SECRET)).toBe(false);
  });
});

describe("github signature (sha256= prefix)", () => {
  it("accepts sha256=<digest> and rejects bare digests", () => {
    const signature = githubSignature(SECRET, BODY);
    expect(signature.startsWith("sha256=")).toBe(true);

    expect(
      verifyGithub(BODY, { "x-hub-signature-256": signature }, SECRET),
    ).toBe(true);
    expect(
      verifyGithub(
        BODY,
        { "x-hub-signature-256": signature.slice("sha256=".length) },
        SECRET,
      ),
    ).toBe(false);
  });
});

describe("shared-secret header (Jira + Freshdesk)", () => {
  it("accepts only an exact match and refuses empty secrets", () => {
    expect(verifyJira("s3cret", "s3cret")).toBe(true);
    expect(verifyJira("s3cret", "s3creT")).toBe(false);
    expect(verifyJira(undefined, "s3cret")).toBe(false);
    expect(verifyJira("", "")).toBe(false);
  });

  it("verifySharedSecret is the same verifier under the Jira alias", () => {
    expect(verifySharedSecret("s3cret", "s3cret")).toBe(true);
    expect(verifyJira).toBe(verifySharedSecret);
  });
});

describe("hmac helper sanity", () => {
  it("matches a hand-rolled hmac", () => {
    expect(sentrySignature(SECRET, BODY)).toBe(
      createHmac("sha256", SECRET).update(BODY).digest("hex"),
    );
  });
});
