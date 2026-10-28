import { slackSignature } from "../../src/modules/webhooks/signatures.ts";

/** Signs a Slack Events API payload the way the real provider would. */
export function signedSlackRequest(
  teamId: string,
  body: unknown,
  secret: string,
): { raw: string; headers: Record<string, string> } {
  const raw = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));

  return {
    raw,
    headers: {
      "content-type": "application/json",
      "x-slack-request-timestamp": timestamp,
      "x-slack-signature": slackSignature(secret, timestamp, raw),
    },
  };
}
