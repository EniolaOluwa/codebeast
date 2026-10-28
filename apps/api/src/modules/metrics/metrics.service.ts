import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from "prom-client";

@Injectable()
export class MetricsService implements OnModuleDestroy {
  readonly registry = new Registry();

  private readonly httpDuration: Histogram<string>;
  private readonly webhookEvents: Counter<string>;
  private readonly runTransitions: Counter<string>;
  private readonly maintenanceActions: Counter<string>;
  readonly queueJobs: Gauge<string>;

  constructor() {
    collectDefaultMetrics({ register: this.registry });

    this.httpDuration = new Histogram({
      name: "http_request_duration_seconds",
      help: "HTTP request duration in seconds",
      labelNames: ["method", "route", "status"] as const,
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.webhookEvents = new Counter({
      name: "webhook_events_total",
      help: "Webhook events processed",
      labelNames: ["provider", "outcome"] as const,
      registers: [this.registry],
    });

    this.runTransitions = new Counter({
      name: "run_transitions_total",
      help: "Run status transitions",
      labelNames: ["status"] as const,
      registers: [this.registry],
    });

    this.maintenanceActions = new Counter({
      name: "maintenance_actions_total",
      help: "Maintenance job outcomes",
      labelNames: ["job", "outcome"] as const,
      registers: [this.registry],
    });

    this.queueJobs = new Gauge({
      name: "queue_jobs",
      help: "BullMQ job counts by queue and state",
      labelNames: ["queue", "state"] as const,
      registers: [this.registry],
    });
  }

  onModuleDestroy(): void {
    this.registry.clear();
  }

  observeHttp(
    method: string,
    route: string,
    status: number,
    durationSeconds: number,
  ): void {
    this.httpDuration.observe(
      { method, route, status: String(status) },
      durationSeconds,
    );
  }

  recordWebhook(provider: string, outcome: string): void {
    this.webhookEvents.inc({ provider, outcome });
  }

  recordRunTransition(status: string): void {
    this.runTransitions.inc({ status });
  }

  recordMaintenance(job: string, outcome: string, count = 1): void {
    this.maintenanceActions.inc({ job, outcome }, count);
  }

  async render(): Promise<string> {
    return this.registry.metrics();
  }
}
