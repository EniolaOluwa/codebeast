import {
  agentCodeRequestSchema,
  agentFailureSchema,
  agentPlanRequestSchema,
  agentValidateRequestSchema,
  agentValidationResultSchema,
  patchSubmissionSchema,
  planBlueprintSchema,
} from "@repo/types";
import type { FastifyInstance } from "fastify";

import { runCoder } from "../coder.ts";
import type { Env } from "../config/env.schema.ts";
import type { Logger } from "../lib/logger.ts";
import type { ChatClient } from "../llm/chat.client.ts";
import { runPlanner } from "../planner.ts";
import type { WorkspaceManager } from "../repo/workspace.ts";
import { runValidator } from "../validator.ts";

export interface RouteDeps {
  env: Env;
  logger: Logger;
  client: ChatClient;
  workspaces: WorkspaceManager;
}

export async function registerRoutes(
  app: FastifyInstance,
  deps: RouteDeps,
): Promise<void> {
  app.get("/health", async () => ({ status: "ok", service: "agent" }));

  app.post("/v1/plan", async (request, reply) => {
    const parsed = agentPlanRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        kind: "terminal",
        reason: parsed.error.message,
      });
    }

    const result = await runPlanner({
      request: parsed.data,
      client: deps.client,
      env: deps.env,
      workspaces: deps.workspaces,
      logger: deps.logger,
    });

    if (!result.ok) {
      return reply.code(422).send(agentFailureSchema.parse(result.failure));
    }

    return reply.code(200).send(planBlueprintSchema.parse(result.value));
  });

  app.post("/v1/code", async (request, reply) => {
    const parsed = agentCodeRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        kind: "terminal",
        reason: parsed.error.message,
      });
    }

    const result = await runCoder({
      request: parsed.data,
      client: deps.client,
      env: deps.env,
      workspaces: deps.workspaces,
      logger: deps.logger,
    });

    if (!result.ok) {
      return reply.code(422).send(agentFailureSchema.parse(result.failure));
    }

    return reply.code(200).send(patchSubmissionSchema.parse(result.value));
  });

  app.post("/v1/validate", async (request, reply) => {
    const parsed = agentValidateRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        kind: "terminal",
        reason: parsed.error.message,
      });
    }

    const result = await runValidator({
      request: parsed.data,
      env: deps.env,
      workspaces: deps.workspaces,
      logger: deps.logger,
    });

    if (!result.ok) {
      return reply.code(422).send(agentFailureSchema.parse(result.failure));
    }

    return reply
      .code(200)
      .send(agentValidationResultSchema.parse(result.value));
  });
}
