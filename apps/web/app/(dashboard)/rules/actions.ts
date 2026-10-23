"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ApiError, apiFetch } from "@/lib/api";

export interface RuleFormState {
  error?: string;
  ok?: boolean;
}

function parseConditions(formData: FormData): Record<string, unknown> {
  const providers = formData.getAll("providers").map(String);
  const minSignalCountRaw = String(formData.get("minSignalCount") ?? "").trim();
  const titleContains = String(formData.get("titleContains") ?? "").trim();

  return {
    ...(providers.length > 0 ? { providers } : {}),
    ...(minSignalCountRaw ? { minSignalCount: Number(minSignalCountRaw) } : {}),
    ...(titleContains ? { titleContains } : {}),
  };
}

export async function createDetectionRuleAction(
  _previous: RuleFormState,
  formData: FormData,
): Promise<RuleFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const action = String(formData.get("action") ?? "DETECT");

  try {
    await apiFetch("/rules", {
      method: "POST",
      body: JSON.stringify({
        kind: "DETECTION",
        name: name || "detection rule",
        // Rules are created disabled; enabling is a separate, explicit step.
        enabled: false,
        conditions: parseConditions(formData),
        actions: { action },
      }),
    });
  } catch (error) {
    return {
      error:
        error instanceof ApiError
          ? error.message
          : "Could not create the rule.",
    };
  }

  revalidatePath("/rules");
  return { ok: true };
}

export async function createAutomationRuleAction(
  _previous: RuleFormState,
  formData: FormData,
): Promise<RuleFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const createTicket = formData.get("createTicket") === "on";
  const openPr = formData.get("openPr") === "on";
  const repositoryId = String(formData.get("repositoryId") ?? "").trim();
  const minConfidenceRaw = String(formData.get("minConfidence") ?? "").trim();
  const dailyPrLimitRaw = String(formData.get("dailyPrLimit") ?? "").trim();
  const confirmed = formData.get("confirmOpenPr") === "on";

  if (!createTicket && !openPr) {
    return { error: "Pick at least one action (ticket, PR or both)." };
  }

  if (openPr && !confirmed) {
    return {
      error:
        "Confirm that this rule opens PRs ready for review and notifies reviewers.",
    };
  }

  if (openPr && (!repositoryId || !minConfidenceRaw || !dailyPrLimitRaw)) {
    return {
      error:
        "Opening PRs needs a repository, a minimum confidence and a daily limit.",
    };
  }

  const actions: Record<string, unknown> = {
    createTicket,
    openPr,
    ...(openPr
      ? {
          repositoryId,
          minConfidence: Number(minConfidenceRaw),
          dailyPrLimit: Number(dailyPrLimitRaw),
        }
      : {}),
  };

  try {
    await apiFetch("/rules", {
      method: "POST",
      body: JSON.stringify({
        kind: "AUTOMATION",
        name: name || "automation rule",
        enabled: false,
        conditions: parseConditions(formData),
        actions,
      }),
    });
  } catch (error) {
    return {
      error:
        error instanceof ApiError
          ? error.message
          : "Could not create the rule.",
    };
  }

  revalidatePath("/rules");
  return { ok: true };
}

export async function toggleRuleAction(formData: FormData): Promise<void> {
  const ruleId = String(formData.get("ruleId") ?? "");
  const enabled = formData.get("enabled") === "true";

  try {
    await apiFetch(`/rules/${ruleId}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    });
  } catch (error) {
    const message =
      error instanceof ApiError ? error.message : "Could not update the rule.";
    redirect(`/rules?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/rules");
}

export async function deleteRuleAction(formData: FormData): Promise<void> {
  const ruleId = String(formData.get("ruleId") ?? "");

  try {
    await apiFetch(`/rules/${ruleId}`, { method: "DELETE" });
  } catch (error) {
    const message =
      error instanceof ApiError ? error.message : "Could not delete the rule.";
    redirect(`/rules?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/rules");
}

export async function dryRunRuleAction(formData: FormData): Promise<void> {
  const ruleId = String(formData.get("ruleId") ?? "");
  let matched: number | null = null;

  try {
    const result = await apiFetch<{ matched: number }>(
      `/rules/${ruleId}/dry-run`,
      { method: "POST" },
    );
    matched = result.matched;
  } catch (error) {
    const message =
      error instanceof ApiError ? error.message : "The dry run failed.";
    redirect(`/rules?error=${encodeURIComponent(message)}`);
  }

  redirect(`/rules?ran=${ruleId}&matched=${matched}`);
}
