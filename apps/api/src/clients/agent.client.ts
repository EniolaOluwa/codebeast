import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  CodeRequestSchema,
  CodeResponseSchema,
  type IssueContext,
  type PatchSubmission,
  type PlanBlueprint,
  PlanResponseSchema,
  ValidateRequestSchema,
  type ValidationResult,
  ValidationResultSchema,
} from "@repo/types";

import {
  ExternalDependencyError,
  ExternalServiceError,
} from "../common/errors/errors.ts";

const REQUEST_TIMEOUT_MS = 180_000;

/**
 * HTTP client for the `agent` service. The api orchestrates the pipeline; the
 * agent performs the DeepSeek reasoning. Contracts are shared via @repo/types.
 */
@Injectable()
export class AgentClient {
  private readonly logger = new Logger(AgentClient.name);
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.getOrThrow<string>("AGENT_SERVICE_URL");
  }

  async plan(
    context: IssueContext,
  ): Promise<{ plan: PlanBlueprint; model: string }> {
    const payload = await this.post("/plan", { context });
    return PlanResponseSchema.parse(payload);
  }

  async code(input: {
    context: IssueContext;
    plan: PlanBlueprint;
    previousError: string | null;
  }): Promise<{ patch: PatchSubmission; model: string }> {
    const body = CodeRequestSchema.parse(input);
    const payload = await this.post("/code", body);
    return CodeResponseSchema.parse(payload);
  }

  async validate(input: {
    context: IssueContext;
    patch: PatchSubmission;
  }): Promise<ValidationResult> {
    const body = ValidateRequestSchema.parse(input);
    const payload = await this.post("/validate", body);
    return ValidationResultSchema.parse(payload);
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new ExternalServiceError(
          "agent",
          `${path} responded ${response.status}: ${text.slice(0, 500)}`,
        );
      }

      return (await response.json()) as unknown;
    } catch (error) {
      if (error instanceof ExternalServiceError) {
        throw error;
      }
      this.logger.error(
        `Agent call ${path} failed`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new ExternalDependencyError(
        "agent",
        error instanceof Error ? error.message : "unreachable",
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
