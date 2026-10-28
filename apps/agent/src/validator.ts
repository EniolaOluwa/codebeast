import {
  type AgentFailure,
  type AgentValidateRequest,
  type ValidationResult,
} from "@repo/types";

import type { Env } from "./config/env.schema.ts";
import type { Logger } from "./lib/logger.ts";
import { findDeniedPaths } from "./patch/denylist.ts";
import type { WorkspaceManager } from "./repo/workspace.ts";
import { Sandbox } from "./sandbox.ts";

export type ValidateOutcome =
  | { ok: true; value: ValidationResult }
  | { ok: false; failure: AgentFailure };

export async function runValidator(input: {
  request: AgentValidateRequest;
  env: Env;
  workspaces: WorkspaceManager;
  logger: Logger;
  sandbox?: Sandbox;
}): Promise<ValidateOutcome> {
  const denied = findDeniedPaths(
    input.request.patch.changes.map((c) => c.path),
  );
  if (denied.length > 0) {
    return {
      ok: false,
      failure: {
        kind: "terminal",
        reason: `patch touches deny-listed paths: ${denied.join(", ")}`,
      },
    };
  }

  if (!input.request.checkout) {
    return {
      ok: false,
      failure: {
        kind: "terminal",
        reason: "validation requires a repository checkout",
      },
    };
  }

  let workspaceDir: string;
  try {
    workspaceDir = await input.workspaces.ensureCheckout(
      input.request.checkout,
    );
  } catch (error) {
    return {
      ok: false,
      failure: {
        kind: "retryable",
        reason: `workspace checkout failed: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }

  const sandbox =
    input.sandbox ??
    new Sandbox({ env: input.env, logger: input.logger });

  let result;
  try {
    result = await sandbox.run({
      workspaceDir,
      patch: input.request.patch,
    });
  } catch (error) {
    return {
      ok: false,
      failure: {
        kind: "retryable",
        reason: `sandbox error: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }

  if (result.output.includes("ERRORED:") || result.exitCode === 2) {
    return {
      ok: true,
      value: {
        status: "ERRORED",
        testsRun: input.request.patch.testsToRun,
        lintPassed: false,
        typesPassed: false,
        output: result.output,
        durationMs: result.durationMs,
        sandboxRunId: result.sandboxRunId,
      },
    };
  }

  if (result.exitCode === 0) {
    return {
      ok: true,
      value: {
        status: "PASSED",
        testsRun: input.request.patch.testsToRun,
        lintPassed: true,
        typesPassed: true,
        output: result.output,
        durationMs: result.durationMs,
        sandboxRunId: result.sandboxRunId,
      },
    };
  }

  return {
    ok: true,
    value: {
      status: "FAILED",
      testsRun: input.request.patch.testsToRun,
      lintPassed: result.lintPassed,
      typesPassed: result.typesPassed,
      output: result.output,
      durationMs: result.durationMs,
      sandboxRunId: result.sandboxRunId,
    },
  };
}
