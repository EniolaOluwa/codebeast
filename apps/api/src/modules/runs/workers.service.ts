import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Worker } from "bullmq";
import { Redis } from "ioredis";

import {
  type IngestJob,
  type MaintenanceJob,
  QUEUE_NAMES,
  type QueueName,
  type RunStageJob,
  type ScanJob,
  type ShipPrJob,
  type TicketJob,
  type TriageJob,
} from "../../queues/queue.types.ts";
import { RawPayloadJanitor } from "../maintenance/raw-payload-janitor.service.ts";
import { StalledRunReaper } from "../maintenance/stalled-run-reaper.service.ts";
import { ScanRunner } from "../scans/scan-runner.service.ts";
import { RunOrchestrator } from "./run-orchestrator.service.ts";

/**
 * BullMQ worker fleet — one Worker per queue, each a thin adapter over the
 * orchestrator (all logic lives there so it is testable without Redis).
 * Disabled under NODE_ENV=test; tests drive the orchestrator directly.
 */
@Injectable()
export class WorkersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkersService.name);
  private readonly connection: Redis;
  private readonly disabled: boolean;
  private workers: Worker[] = [];

  constructor(
    private readonly orchestrator: RunOrchestrator,
    private readonly scanRunner: ScanRunner,
    private readonly stalledRunReaper: StalledRunReaper,
    private readonly rawPayloadJanitor: RawPayloadJanitor,
    config: ConfigService,
  ) {
    this.connection = new Redis(config.getOrThrow<string>("REDIS_URL"), {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
    this.disabled = config.getOrThrow<string>("NODE_ENV") === "test";
  }

  onModuleInit(): void {
    if (this.disabled) {
      this.logger.log("queue workers disabled (test environment)");
      return;
    }

    this.workers = QUEUE_NAMES.map((queue) => {
      const worker = new Worker(
        queue,
        async (job) => this.dispatch(queue, job.data as unknown),
        { connection: this.connection, concurrency: 5 },
      );

      worker.on("failed", (job, error) => {
        this.logger.error(
          `job ${queue}#${job?.id ?? "?"} failed (attempt ${job?.attemptsMade ?? "?"}): ${error.message}`,
        );
      });

      return worker;
    });

    this.logger.log(`queue workers started: ${QUEUE_NAMES.join(", ")}`);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.close()));
    this.workers = [];

    if (this.disabled) {
      this.connection.disconnect();
    } else {
      await this.connection.quit();
    }
  }

  private async dispatch(queue: QueueName, data: unknown): Promise<void> {
    switch (queue) {
      case "ingest":
        return this.orchestrator.handleIngest(data as IngestJob);
      case "triage":
        return this.orchestrator.handleTriage(data as TriageJob);
      case "plan":
        return this.orchestrator.handlePlan(data as RunStageJob);
      case "code":
        return this.orchestrator.handleCode(data as RunStageJob);
      case "validate":
        return this.orchestrator.handleValidate(data as RunStageJob);
      case "pr":
        return this.orchestrator.handleShipPr(data as ShipPrJob);
      case "ticket":
        return this.orchestrator.handleCreateTicket(data as TicketJob);
      case "scan": {
        await this.scanRunner.run(data as ScanJob);
        return;
      }
      case "maintenance": {
        const job = data as MaintenanceJob;
        if (job.kind === "stalled-runs") {
          await this.stalledRunReaper.run();
        } else {
          await this.rawPayloadJanitor.run();
        }
        return;
      }
    }
  }
}
