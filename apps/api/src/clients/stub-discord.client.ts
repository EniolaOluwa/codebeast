import { Injectable, Logger } from "@nestjs/common";

import type { DiscordClient } from "./discord.client.ts";

/**
 * Deterministic stand-in, active unless DISCORD_CLIENT_MODE=api. Returns one
 * canned message per channel so the scan path is demonstrable end to end.
 */
@Injectable()
export class StubDiscordClient implements DiscordClient {
  private readonly logger = new Logger(StubDiscordClient.name);

  async fetchMessages(input: { tenantId: string; channelId: string }) {
    this.logger.warn(
      "stub Discord client active (DISCORD_CLIENT_MODE != api) — returning one canned message",
    );

    return [
      {
        id: `stub-discord-${input.channelId}`,
        content:
          "Stub Discord message: checkout is broken on mobile (demo data from the stub client)",
        author: { id: "stub-user", username: "stub-support", bot: false },
        timestamp: new Date().toISOString(),
        channelId: input.channelId,
      },
    ];
  }
}
