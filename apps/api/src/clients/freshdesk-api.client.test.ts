import { describe, expect, it } from "vitest";

import { FreshdeskApiClient } from "./freshdesk-api.client.ts";
import type { FetchLike, FetchResponseLike } from "./jira-api.client.ts";

interface RecordedCall {
  url: string;
  init?: { headers?: Record<string, string> };
}

function makeClient(
  options: {
    integrationMissing?: boolean;
    domainMissing?: boolean;
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
    : {
        id: "integration_1",
        config: options.domainMissing ? {} : { domain: "acme.freshdesk.com" },
        secrets: "encrypted",
      };

  const prisma = {
    withTenant: async (_tenantId: string, fn: (tx: unknown) => unknown) =>
      fn({ integration: { findFirst: async () => integration } }),
  };

  const integrations = {
    getSecrets: (): Record<string, string> =>
      options.credentialsMissing ? {} : { apiKey: "fd-key" },
  };

  return {
    client: new FreshdeskApiClient(
      prisma as never,
      integrations as never,
      fetchFn,
    ),
    calls,
  };
}

describe("FreshdeskApiClient.fetchTickets", () => {
  it("lists tickets with basic auth and maps the fields", async () => {
    const { client, calls } = makeClient({
      responses: [
        {
          body: [
            {
              id: 8841,
              subject: "Export fails",
              description_text: "500 on large tables",
              requester: { name: "Dana", email: "dana@customer.example" },
              created_at: "2026-10-22T08:00:00.000Z",
            },
          ],
        },
      ],
    });

    const tickets = await client.fetchTickets({
      tenantId: "tenant_1",
      limit: 30,
    });

    expect(calls[0]!.url).toBe(
      "https://acme.freshdesk.com/api/v2/tickets?per_page=30&order_by=created_at&order_type=desc",
    );
    expect(calls[0]!.init?.headers?.authorization).toBe(
      `Basic ${Buffer.from("fd-key:X").toString("base64")}`,
    );
    expect(tickets).toEqual([
      {
        id: 8841,
        subject: "Export fails",
        description_text: "500 on large tables",
        requester: { name: "Dana", email: "dana@customer.example" },
        created_at: "2026-10-22T08:00:00.000Z",
      },
    ]);
  });

  it("fails loudly without an integration, domain, key or on API errors", async () => {
    await expect(
      makeClient({ integrationMissing: true }).client.fetchTickets({
        tenantId: "t",
      }),
    ).rejects.toThrow(/No Freshdesk integration/);

    await expect(
      makeClient({ domainMissing: true }).client.fetchTickets({
        tenantId: "t",
      }),
    ).rejects.toThrow(/domain/);

    await expect(
      makeClient({ credentialsMissing: true }).client.fetchTickets({
        tenantId: "t",
      }),
    ).rejects.toThrow(/apiKey/);

    await expect(
      makeClient({
        responses: [{ status: 403, body: {} }],
      }).client.fetchTickets({ tenantId: "t" }),
    ).rejects.toThrow(/failed \(403\)/);
  });
});
