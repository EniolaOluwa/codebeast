import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { WebhookSignatureService } from "./webhook-signature.service.ts";

const service = new WebhookSignatureService();
const body = Buffer.from(JSON.stringify({ hello: "world" }));

describe("WebhookSignatureService", () => {
  it("accepts a valid GitHub signature", () => {
    const secret = "github-secret";
    const signature = `sha256=${createHmac("sha256", secret)
      .update(body)
      .digest("hex")}`;

    expect(() =>
      service.verify("GITHUB", secret, body, {
        "x-hub-signature-256": signature,
      }),
    ).not.toThrow();
  });

  it("rejects an invalid GitHub signature", () => {
    expect(() =>
      service.verify("GITHUB", "github-secret", body, {
        "x-hub-signature-256": "sha256=deadbeef",
      }),
    ).toThrow(/Invalid GitHub signature/);
  });

  it("rejects GitHub webhooks without a configured secret", () => {
    expect(() => service.verify("GITHUB", null, body, {})).toThrow(
      /no webhook secret/,
    );
  });

  it("accepts a valid Slack signature", () => {
    const secret = "slack-secret";
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = `v0=${createHmac("sha256", secret)
      .update(`v0:${timestamp}:${body.toString("utf8")}`)
      .digest("hex")}`;

    expect(() =>
      service.verify("SLACK", secret, body, {
        "x-slack-signature": signature,
        "x-slack-request-timestamp": timestamp,
      }),
    ).not.toThrow();
  });

  it("rejects a stale Slack request", () => {
    expect(() =>
      service.verify("SLACK", "slack-secret", body, {
        "x-slack-signature": "v0=deadbeef",
        "x-slack-request-timestamp": "1",
      }),
    ).toThrow(/Stale Slack request/);
  });

  it("allows unsigned Sentry webhooks when no secret is configured", () => {
    expect(() => service.verify("SENTRY", null, body, {})).not.toThrow();
  });

  it("enforces optional HMAC for Sentry when a secret exists", () => {
    expect(() => service.verify("SENTRY", "secret", body, {})).toThrow(
      /Missing webhook signature/,
    );
  });
});
