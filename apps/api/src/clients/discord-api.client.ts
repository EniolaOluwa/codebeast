import { IntegrationsService } from "../modules/integrations/integrations.service.ts";
import type { DiscordMessageInput } from "../modules/webhooks/normalizers.ts";
import { PrismaService } from "../prisma/prisma.service.ts";
import type { DiscordClient } from "./discord.client.ts";
import type { FetchLike } from "./jira-api.client.ts";

/**
 * Discord REST client (API v10). Credentials come from the tenant's DISCORD
 * integration: `secrets.botToken` (the bot must be in the server).
 */
export class DiscordApiClient implements DiscordClient {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
    private readonly fetchFn: FetchLike = globalThis.fetch as unknown as FetchLike,
  ) {}

  async fetchMessages(input: {
    tenantId: string;
    channelId: string;
    limit?: number;
  }): Promise<DiscordMessageInput[]> {
    const botToken = await this.botToken(input.tenantId);
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);

    const response = await this.fetchFn(
      `https://discord.com/api/v10/channels/${input.channelId}/messages?limit=${limit}`,
      { headers: { authorization: `Bot ${botToken}` } },
    );

    if (!response.ok) {
      const detail = response.text ? await response.text().catch(() => "") : "";

      throw new Error(
        `Discord API GET channel ${input.channelId} failed (${response.status}): ${detail.slice(0, 200)}`,
      );
    }

    const messages = (await response.json()) as {
      id: string;
      content?: string;
      author?: { id?: string; username?: string; bot?: boolean };
      timestamp?: string;
    }[];

    return messages.map((message) => ({
      id: message.id,
      content: message.content ?? "",
      author: {
        id: message.author?.id ?? "unknown",
        username: message.author?.username ?? "unknown",
        bot: message.author?.bot ?? false,
      },
      timestamp: message.timestamp ?? new Date().toISOString(),
      channelId: input.channelId,
    }));
  }

  private async botToken(tenantId: string): Promise<string> {
    const integration = await this.prisma.withTenant(tenantId, (tx) =>
      tx.integration.findFirst({
        where: { tenantId, type: "DISCORD", enabled: true },
      }),
    );

    if (!integration) {
      throw new Error("No Discord integration is connected for this workspace");
    }

    const secrets = this.integrations.getSecrets(integration);

    if (!secrets.botToken) {
      throw new Error("The Discord integration needs a botToken secret");
    }

    return secrets.botToken;
  }
}
