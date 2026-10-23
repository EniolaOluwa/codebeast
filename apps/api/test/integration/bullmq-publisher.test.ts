import { Queue } from "bullmq";
import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BullMqQueuePublisher } from "../../src/queues/bullmq-queue.publisher.ts";
import { dockerAvailable } from "../support/docker.ts";

/**
 * The publisher is the only component that talks to Redis directly; prove
 * against a real Redis that job ids dedupe, delays delay and the retry policy
 * is attached.
 */
describe.runIf(dockerAvailable)("BullMqQueuePublisher (redis)", () => {
  let container: StartedTestContainer;
  let publisher: BullMqQueuePublisher;
  let redisUrl: string;

  beforeAll(async () => {
    container = await new GenericContainer("redis:7-alpine")
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
      .start();

    redisUrl = `redis://${container.getHost()}:${container.getMappedPort(6379)}`;

    publisher = new BullMqQueuePublisher({
      getOrThrow: (): string => redisUrl,
    } as never);
  });

  afterAll(async () => {
    await publisher.onModuleDestroy();
  });

  it("dedupes by jobId while the job is still pending", async () => {
    const queue = new Queue("plan", { connection: { url: redisUrl } });

    await publisher.publish(
      "plan",
      { tenantId: "t1", runId: "r1" },
      { jobId: "run-r1-plan-1" },
    );
    await publisher.publish(
      "plan",
      { tenantId: "t1", runId: "r1" },
      { jobId: "run-r1-plan-1" },
    );

    const counts = await queue.getJobCounts();
    expect(counts.waiting).toBe(1);

    await queue.close();
  });

  it("attaches retry/backoff policy and removes completed jobs", async () => {
    const queue = new Queue("code", { connection: { url: redisUrl } });

    await publisher.publish(
      "code",
      { tenantId: "t1", runId: "r2" },
      { jobId: "run-r2-code-1" },
    );

    const job = await queue.getJob("run-r2-code-1");
    expect(job?.opts.attempts).toBe(3);
    expect(job?.opts.backoff).toEqual({ type: "exponential", delay: 3_000 });
    expect(job?.opts.removeOnComplete).toBe(true);
    expect(job?.opts.removeOnFail).toBe(true);

    await queue.close();
  });

  it("delays the triage coalescing job", async () => {
    const queue = new Queue("triage", { connection: { url: redisUrl } });

    await publisher.publish(
      "triage",
      { tenantId: "t1", issueId: "i1" },
      { jobId: "triage-i1", delayMs: 30_000 },
    );

    const counts = await queue.getJobCounts();
    expect(counts.delayed).toBe(1);

    await queue.close();
  });
});
