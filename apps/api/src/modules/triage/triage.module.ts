import { Module } from "@nestjs/common";

import { EnrichmentService, SIGNAL_ENRICHERS } from "./enrichment.service.ts";
import { TriageService } from "./triage.service.ts";

@Module({
  providers: [
    { provide: SIGNAL_ENRICHERS, useValue: [] },
    EnrichmentService,
    TriageService,
  ],
  exports: [EnrichmentService, TriageService],
})
export class TriageModule {}
