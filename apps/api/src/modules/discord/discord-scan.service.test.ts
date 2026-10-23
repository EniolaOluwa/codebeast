import type { NormalizedSignal } from "@repo/types";
import { describe, expect, it, vi } from "vitest";

import { DiscordScanService } from "./discord-scan.service.ts";

function makeHarness(
  options: {
    integration?: Record<string, unknown> | null;
    messages?: Record<string, unknown>[];
  } = {},
) {
  const integration =
    options.integration === undefined
      ? {
          id: "integration_1",
          enabled: true,
          config: { guildId: "guild-1", channelIds: ["chan-1", "chan-2"] },
        }
      : options.integration;

  const tx = {
    integration: {
      findFirst: vi.fn().mockResolvedValue(integration),
      update: vi.fn(),
    },
  };

  const prisma = {
    withTenant: vi.fn(
      async (_tenantId: string, fn: (txArg: unknown) => unknown) => fn(tx),
    ),
  };

  const discord = {
    fetchMessages: vi.fn().mockResolvedValue(
      options.messages ?? [
        {
          id: "msg-1",
          content: "checkout broken",
          author: { id: "u1", username: "agent", bot: false },
          timestamp: "2026-10-23T10:00:00.000Z",
          channelId: "chan-1",
        },
        {
          id: "msg-bot",
          content: "bot noise",
          author: { id: "b1", username: "helper-bot", bot: true },
          timestamp: "2026-10-23T10:01:00.000Z",
          channelId: "chan-1",
        },
      ],
    ),
  };

  const ingest = {
    ingest: vi.fn(async (_tenantId: string, signals: NormalizedSignal[]) =>
      signals.map(() => ({
        issueId: "issue_1",
        signalId: "signal_1",
        issueCreated: true,
        signalAttached: true,
      })),
    ),
  };

  return {
    service: new DiscordScanService(
      prisma as never,
      discord as never,
      ingest as never,
    ),
    tx,
    discord,
    ingest,
  };
}

describe("DiscordScanService", () => {
  it("scans every configured channel, skips bot messages and imports the rest", async () => {
    const { service, discord, ingest, tx } = makeHarness();

    const result = await service.run({
      tenantId: "tenant_1",
      integrationId: "integration_1",
    });

    expect(discord.fetchMessages).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ scanned: 2, imported: 2 });

    const signals = ingest.ingest.mock.calls[0]![1];
    expect(signals.map((signal) => signal.externalId)).toEqual([
      "msg-1",
      "msg-1",
    ]);
    expect(signals[0]).toMatchObject({
      provider: "DISCORD",
      correlationKey: "discord:guild-1:chan-1:msg-1",
    });

    expect(tx.integration.update.mock.calls[0]![0].data.config).toMatchObject({
      lastScanFound: 2,
      guildId: "guild-1",
    });
  });

  it("skips integrations without channels, disabled or missing", async () => {
    const noChannels = makeHarness({
      integration: { id: "i1", enabled: true, config: {} },
    });
    await expect(
      noChannels.service.run({ tenantId: "t", integrationId: "i1" }),
    ).resolves.toEqual({ scanned: 0, imported: 0 });
    expect(noChannels.discord.fetchMessages).not.toHaveBeenCalled();

    const disabled = makeHarness({
      integration: { id: "i1", enabled: false, config: { channelIds: ["c"] } },
    });
    await expect(
      disabled.service.run({ tenantId: "t", integrationId: "i1" }),
    ).resolves.toEqual({ scanned: 0, imported: 0 });

    const missing = makeHarness({ integration: null });
    await expect(
      missing.service.run({ tenantId: "t", integrationId: "nope" }),
    ).resolves.toEqual({ scanned: 0, imported: 0 });
  });
});
