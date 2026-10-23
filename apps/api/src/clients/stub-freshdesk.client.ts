import { Injectable, Logger } from "@nestjs/common";

import type { FreshdeskClient } from "./freshdesk.client.ts";

/**
 * Deterministic stand-in, active unless FRESHDESK_CLIENT_MODE=api. Returns one
 * canned conversation so the scan path is demonstrable end to end.
 */
@Injectable()
export class StubFreshdeskClient implements FreshdeskClient {
  private readonly logger = new Logger(StubFreshdeskClient.name);

  async fetchTickets() {
    this.logger.warn(
      "stub Freshdesk client active (FRESHDESK_CLIENT_MODE != api) — returning one canned conversation",
    );

    return [
      {
        id: 8841,
        subject: "Stub Freshdesk conversation #8841",
        description_text:
          "Customer reports the export fails on large tables (demo data from the stub client).",
        requester: { name: "Stub Customer", email: "stub@customer.example" },
        created_at: new Date().toISOString(),
      },
    ];
  }
}
