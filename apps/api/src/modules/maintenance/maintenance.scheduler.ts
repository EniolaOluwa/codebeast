import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import { Redis } from "ioredis";

import type { MaintenanceJob } from "../../queues/queue.types.ts";

/**
 * Registers BullMQ job schedulers for fleet-wide maintenance. Disabled under
 * test and when MAINTENANCE_ENABLED=false. One scheduler instance per process
 * is fine — BullMQ upserts by id so the fleet shares a single cadence.
 */
@Injectable()
export class MaintenanceScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MaintenanceScheduler.name);
  private readonly connection: Redis;
  private readonly enabled: boolean;
  private queue: Queue<MaintenanceJob> | null = null;

  constructor(config: ConfigService) {
    this.connection = new Redis(config.getOrThrow<string>("REDIS_URL"), {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
    const nodeEnv = config.getOrThrow<string>("NODE_ENV");
    const maintenanceEnabled =
      config.get<boolean>("MAINTENANCE_ENABLED") ?? true;
    this.enabled = nodeEnv !== "test" && maintenanceEnabled;
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.log("maintenance schedulers disabled");
      return;
    }

    this.queue = new Queue<MaintenanceJob>("maintenance", {
      connection: this.connection,
    });

    await this.queue.upsertJobScheduler(
      "stalled-runs",
      { every: 5 * 60_000 },
      {
        name: "stalled-runs",
        data: { kind: "stalled-runs" },
        opts: { removeOnComplete: true, removeOnFail: true },
      },
    );

    await this.queue.upsertJobScheduler(
      "raw-payloads",
      { every: 60 * 60_000 },
      {
        name: "raw-payloads",
        data: { kind: "raw-payloads" },
        opts: { removeOnComplete: true, removeOnFail: true },
      },
    );

    this.logger.log("maintenance schedulers registered");
  }

  async onModuleDestroy(): Promise<void> {
    if (this.queue) {
      await this.queue.close();
      this.queue = null;
    }

    this.connection.disconnect();
  }
}
