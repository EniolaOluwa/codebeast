import { IntegrationsService } from "../modules/integrations/integrations.service.ts";
import type { FreshdeskTicketInput } from "../modules/webhooks/normalizers.ts";
import { PrismaService } from "../prisma/prisma.service.ts";
import type { FreshdeskClient } from "./freshdesk.client.ts";
import type { FetchLike } from "./jira-api.client.ts";

/**
 * Freshdesk REST client (API v2). Credentials come from the tenant's
 * FRESHDESK integration: `config.domain` plus `secrets.apiKey`.
 */
export class FreshdeskApiClient implements FreshdeskClient {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
    private readonly fetchFn: FetchLike = globalThis.fetch as unknown as FetchLike,
  ) {}

  async fetchTickets(input: {
    tenantId: string;
    limit?: number;
  }): Promise<FreshdeskTicketInput[]> {
    const { domain, apiKey } = await this.credentials(input.tenantId);
    const perPage = Math.min(Math.max(input.limit ?? 30, 1), 100);

    const response = await this.fetchFn(
      `https://${domain}/api/v2/tickets?per_page=${perPage}&order_by=created_at&order_type=desc`,
      {
        headers: {
          authorization: `Basic ${Buffer.from(`${apiKey}:X`).toString("base64")}`,
        },
      },
    );

    if (!response.ok) {
      const detail = response.text ? await response.text().catch(() => "") : "";

      throw new Error(
        `Freshdesk API list tickets failed (${response.status}): ${detail.slice(0, 200)}`,
      );
    }

    const tickets = (await response.json()) as {
      id: number | string;
      subject?: string;
      description_text?: string;
      requester?: { name?: string; email?: string } | null;
      created_at?: string;
    }[];

    return tickets.map((ticket) => ({
      id: ticket.id,
      subject: ticket.subject ?? null,
      description_text: ticket.description_text ?? null,
      requester: ticket.requester ?? null,
      created_at: ticket.created_at ?? null,
    }));
  }

  private async credentials(
    tenantId: string,
  ): Promise<{ domain: string; apiKey: string }> {
    const integration = await this.prisma.withTenant(tenantId, (tx) =>
      tx.integration.findFirst({
        where: { tenantId, type: "FRESHDESK", enabled: true },
      }),
    );

    if (!integration) {
      throw new Error(
        "No Freshdesk integration is connected for this workspace",
      );
    }

    const config = (integration.config ?? {}) as { domain?: string };

    if (!config.domain) {
      throw new Error("The Freshdesk integration needs a domain in its config");
    }

    const secrets = this.integrations.getSecrets(integration);

    if (!secrets.apiKey) {
      throw new Error("The Freshdesk integration needs an apiKey secret");
    }

    return {
      domain: config.domain.replace(/\/+$/, ""),
      apiKey: secrets.apiKey,
    };
  }
}
