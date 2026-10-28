import { createHmac, timingSafeEqual } from "node:crypto";

import { Injectable } from "@nestjs/common";
import type { WebhookSource } from "@repo/types";

import { UnauthorizedError } from "../../common/errors/errors.ts";

type HeaderMap = Record<string, string | string[] | undefined>;

function header(headers: HeaderMap, name: string): string | null {
  const value = headers[name];
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

@Injectable()
export class WebhookSignatureService {
  verify(
    source: WebhookSource,
    secret: string | null,
    rawBody: Buffer,
    headers: HeaderMap,
  ): void {
    if (source === "GITHUB") {
      this.verifyGithub(secret, rawBody, headers);
      return;
    }
    if (source === "SLACK") {
      this.verifySlack(secret, rawBody, headers);
      return;
    }
    this.verifyOptionalHmac(secret, rawBody, headers);
  }

  private verifyGithub(
    secret: string | null,
    rawBody: Buffer,
    headers: HeaderMap,
  ): void {
    if (!secret) {
      throw new UnauthorizedError("GitHub integration has no webhook secret");
    }
    const signature = header(headers, "x-hub-signature-256");
    if (!signature?.startsWith("sha256=")) {
      throw new UnauthorizedError("Missing GitHub signature");
    }
    const expected = `sha256=${createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex")}`;
    if (!safeEqual(signature, expected)) {
      throw new UnauthorizedError("Invalid GitHub signature");
    }
  }

  private verifySlack(
    secret: string | null,
    rawBody: Buffer,
    headers: HeaderMap,
  ): void {
    if (!secret) {
      throw new UnauthorizedError("Slack integration has no signing secret");
    }
    const signature = header(headers, "x-slack-signature");
    const timestamp = header(headers, "x-slack-request-timestamp");
    if (!signature || !timestamp) {
      throw new UnauthorizedError("Missing Slack signature headers");
    }

    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
      throw new UnauthorizedError("Stale Slack request");
    }

    const base = `v0:${timestamp}:${rawBody.toString("utf8")}`;
    const expected = `v0=${createHmac("sha256", secret)
      .update(base)
      .digest("hex")}`;

    if (!safeEqual(signature, expected)) {
      throw new UnauthorizedError("Invalid Slack signature");
    }
  }

  private verifyOptionalHmac(
    secret: string | null,
    rawBody: Buffer,
    headers: HeaderMap,
  ): void {
    if (!secret) {
      return;
    }
    const signature = header(headers, "x-webhook-signature");
    if (!signature) {
      throw new UnauthorizedError("Missing webhook signature");
    }
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    if (!safeEqual(signature, expected)) {
      throw new UnauthorizedError("Invalid webhook signature");
    }
  }
}
