import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Pure signature verification for the four inbound providers. Each helper
 * computes the expected digest and compares in constant time; callers map a
 * `false` to a 401 and never a 500.
 */

export const SLACK_REPLAY_WINDOW_SECONDS = 300;

export type HeaderBag = Record<string, string | string[] | undefined>;

export function header(bag: HeaderBag, name: string): string | undefined {
  const value = bag[name.toLowerCase()];

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function safeEqual(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");

  if (providedBuf.length !== expectedBuf.length) {
    return false;
  }

  return timingSafeEqual(providedBuf, expectedBuf);
}

// --- Slack: `v0=hex(HMAC-SHA256(secret, "v0:<timestamp>:<body>"))` ----------

export function slackSignature(
  secret: string,
  timestamp: string,
  rawBody: string,
): string {
  const digest = createHmac("sha256", secret)
    .update(`v0:${timestamp}:${rawBody}`)
    .digest("hex");

  return `v0=${digest}`;
}

export function verifySlack(
  rawBody: string,
  headers: HeaderBag,
  secret: string,
  now = Date.now(),
): boolean {
  const signature = header(headers, "x-slack-signature");
  const timestamp = header(headers, "x-slack-request-timestamp");

  if (!signature || !timestamp) {
    return false;
  }

  const seconds = Number(timestamp);

  if (!Number.isFinite(seconds)) {
    return false;
  }

  if (Math.abs(now / 1000 - seconds) > SLACK_REPLAY_WINDOW_SECONDS) {
    return false;
  }

  return safeEqual(signature, slackSignature(secret, timestamp, rawBody));
}

// --- Sentry: `hex(HMAC-SHA256(secret, body))` -------------------------------

export function sentrySignature(secret: string, rawBody: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

export function verifySentry(
  rawBody: string,
  headers: HeaderBag,
  secret: string,
): boolean {
  const signature = header(headers, "sentry-hook-signature");

  if (!signature) {
    return false;
  }

  return safeEqual(signature, sentrySignature(secret, rawBody));
}

// --- GitHub: `sha256=hex(HMAC-SHA256(secret, body))` ------------------------

export function githubSignature(secret: string, rawBody: string): string {
  const digest = createHmac("sha256", secret).update(rawBody).digest("hex");

  return `sha256=${digest}`;
}

export function verifyGithub(
  rawBody: string,
  headers: HeaderBag,
  secret: string,
): boolean {
  const signature = header(headers, "x-hub-signature-256");

  if (!signature) {
    return false;
  }

  return safeEqual(signature, githubSignature(secret, rawBody));
}

// --- Shared-secret header (Jira and Freshdesk webhooks are not HMAC-signed) --

export function verifySharedSecret(
  providedSecret: string | undefined,
  integrationSecret: string,
): boolean {
  if (!providedSecret || !integrationSecret) {
    return false;
  }

  return safeEqual(providedSecret, integrationSecret);
}

export const verifyJira = verifySharedSecret;
