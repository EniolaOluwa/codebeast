import type { FreshdeskTicketInput } from "../modules/webhooks/normalizers.ts";

/** Freshdesk supports inbound webhooks and a REST scan (API v2). */
export interface FreshdeskClient {
  fetchTickets(input: {
    tenantId: string;
    limit?: number;
  }): Promise<FreshdeskTicketInput[]>;
}

export const FRESHDESK_CLIENT = Symbol("FRESHDESK_CLIENT");
