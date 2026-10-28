import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  agentFailureSchema,
  agentValidationResultSchema,
  type IssueContext,
  type PatchSubmission,
  patchSubmissionSchema,
  type PlanBlueprint,
  planBlueprintSchema,
  type RepositoryCheckout,
  type ValidationResult,
} from "@repo/types";

import type { AgentClient, AgentResult } from "./agent.client.ts";

/**
 * HTTP client for `apps/agent`. Selected when AGENT_CLIENT_MODE=http.
 */
@Injectable()
export class HttpAgentClient implements AgentClient {
  private readonly logger = new Logger(HttpAgentClient.name);
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: ConfigService, fetchImpl: typeof fetch = fetch) {
    this.baseUrl = config
      .getOrThrow<string>("AGENT_SERVICE_URL")
      .replace(/\/$/, "");
    this.token = config.getOrThrow<string>("AGENT_SERVICE_TOKEN");
    this.fetchImpl = fetchImpl;
  }

  plan(input: {
    context: IssueContext;
    checkout?: RepositoryCheckout;
  }): Promise<AgentResult<PlanBlueprint>> {
    return this.post("/v1/plan", input, planBlueprintSchema);
  }

  code(input: {
    context: IssueContext;
    plan: PlanBlueprint;
    previousError?: string;
    checkout?: RepositoryCheckout;
  }): Promise<AgentResult<PatchSubmission>> {
    return this.post("/v1/code", input, patchSubmissionSchema);
  }

  validate(input: {
    patch: PatchSubmission;
    context: IssueContext;
    checkout?: RepositoryCheckout;
  }): Promise<AgentResult<ValidationResult>> {
    return this.post("/v1/validate", input, agentValidationResultSchema);
  }

  private async post<T>(
    path: string,
    body: unknown,
    schema: { parse: (value: unknown) => T },
  ): Promise<AgentResult<T>> {
    this.logger.log(`agent ${path}`);

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      return {
        ok: false,
        failure: {
          kind: "retryable",
          reason: `agent unreachable: ${error instanceof Error ? error.message : String(error)}`,
        },
      };
    }

    const json: unknown = await response.json().catch(() => null);

    if (response.status === 422) {
      const failure = agentFailureSchema.safeParse(json);
      if (failure.success) {
        return { ok: false, failure: failure.data };
      }
      return {
        ok: false,
        failure: {
          kind: "retryable",
          reason: "agent returned 422 with invalid failure body",
        },
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        failure: {
          kind: response.status >= 500 ? "retryable" : "terminal",
          reason: `agent HTTP ${response.status}`,
        },
      };
    }

    try {
      return { ok: true, value: schema.parse(json) };
    } catch (error) {
      return {
        ok: false,
        failure: {
          kind: "retryable",
          reason: `agent response schema mismatch: ${error instanceof Error ? error.message : String(error)}`,
        },
      };
    }
  }
}
