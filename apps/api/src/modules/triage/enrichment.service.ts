import { Inject, Injectable } from "@nestjs/common";
import type { Provider } from "@repo/types";

/**
 * Lazy enrichment seams: pulling richer context from a provider (full stack
 * trace, thread replies) happens once per triage, at context-build time —
 * never on the ingestion hot path.
 */
export interface SignalEnricher {
  readonly provider: Provider;
  enrich(input: {
    tenantId: string;
    externalId: string;
    url: string | null;
  }): Promise<Record<string, unknown> | null>;
}

export const SIGNAL_ENRICHERS = Symbol("SIGNAL_ENRICHERS");

@Injectable()
export class EnrichmentService {
  constructor(
    @Inject(SIGNAL_ENRICHERS) private readonly enrichers: SignalEnricher[],
  ) {}

  /** First registered enricher for each provider wins; results are merged. */
  async enrich(
    tenantId: string,
    signals: {
      provider: Provider;
      externalId: string;
      url: string | null;
    }[],
  ): Promise<Record<string, unknown> | null> {
    const merged: Record<string, unknown> = {};

    for (const signal of signals) {
      const enricher = this.enrichers.find(
        (candidate) => candidate.provider === signal.provider,
      );

      if (!enricher) {
        continue;
      }

      const data = await enricher.enrich({
        tenantId,
        externalId: signal.externalId,
        url: signal.url,
      });

      if (data) {
        Object.assign(merged, data);
      }
    }

    return Object.keys(merged).length > 0 ? merged : null;
  }
}
