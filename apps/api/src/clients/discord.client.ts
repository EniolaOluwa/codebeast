import type { DiscordMessageInput } from "../modules/webhooks/normalizers.ts";

/**
 * Discord is scan-only (bots read via REST; Discord does not push message
 * webhooks), mirroring the Jira-scan pattern.
 */
export interface DiscordClient {
  fetchMessages(input: {
    tenantId: string;
    channelId: string;
    limit?: number;
  }): Promise<DiscordMessageInput[]>;
}

export const DISCORD_CLIENT = Symbol("DISCORD_CLIENT");
