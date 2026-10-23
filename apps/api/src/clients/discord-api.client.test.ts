import { describe, expect, it } from "vitest";

import { DiscordApiClient } from "./discord-api.client.ts";
import type { FetchLike, FetchResponseLike } from "./jira-api.client.ts";

interface RecordedCall {
  url: string;
  init?: { headers?: Record<string, string> };
}

function makeClient(
  options: {
    integrationMissing?: boolean;
    credentialsMissing?: boolean;
    responses?: { status?: number; body: unknown }[];
  } = {},
) {
  const calls: RecordedCall[] = [];
  const queued = [...(options.responses ?? [])];

  const fetchFn: FetchLike = async (url, init) => {
    calls.push({ url, ...(init ? { init } : {}) });
    const next = queued.shift() ?? { status: 200, body: [] };
    const status = next.status ?? 200;

    const response: FetchResponseLike = {
      ok: status < 400,
      status,
      json: async () => next.body,
      text: async () => JSON.stringify(next.body),
    };

    return response;
  };

  const integration = options.integrationMissing
    ? null
    : { id: "integration_1", config: {}, secrets: "encrypted" };

  const prisma = {
    withTenant: async (_tenantId: string, fn: (tx: unknown) => unknown) =>
      fn({ integration: { findFirst: async () => integration } }),
  };

  const integrations = {
    getSecrets: (): Record<string, string> =>
      options.credentialsMissing ? {} : { botToken: "bot-token" },
  };

  return {
    client: new DiscordApiClient(
      prisma as never,
      integrations as never,
      fetchFn,
    ),
    calls,
  };
}

describe("DiscordApiClient.fetchMessages", () => {
  it("calls the channel messages endpoint with the bot token", async () => {
    const { client, calls } = makeClient({
      responses: [
        {
          body: [
            {
              id: "msg-1",
              content: "checkout broken",
              author: { id: "u1", username: "agent", bot: false },
              timestamp: "2026-10-23T10:00:00.000Z",
            },
            { id: "msg-2" },
          ],
        },
      ],
    });

    const messages = await client.fetchMessages({
      tenantId: "tenant_1",
      channelId: "chan-1",
      limit: 50,
    });

    expect(calls[0]!.url).toBe(
      "https://discord.com/api/v10/channels/chan-1/messages?limit=50",
    );
    expect(calls[0]!.init?.headers?.authorization).toBe("Bot bot-token");

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      id: "msg-1",
      content: "checkout broken",
      channelId: "chan-1",
    });
    expect(messages[1]).toMatchObject({
      id: "msg-2",
      content: "",
      author: { username: "unknown", bot: false },
    });
  });

  it("fails loudly without an integration, token or on API errors", async () => {
    await expect(
      makeClient({ integrationMissing: true }).client.fetchMessages({
        tenantId: "t",
        channelId: "c",
      }),
    ).rejects.toThrow(/No Discord integration/);

    await expect(
      makeClient({ credentialsMissing: true }).client.fetchMessages({
        tenantId: "t",
        channelId: "c",
      }),
    ).rejects.toThrow(/botToken/);

    await expect(
      makeClient({
        responses: [{ status: 401, body: {} }],
      }).client.fetchMessages({ tenantId: "t", channelId: "c" }),
    ).rejects.toThrow(/failed \(401\)/);
  });
});
