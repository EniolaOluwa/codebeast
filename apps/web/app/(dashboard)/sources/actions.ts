"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ApiError, apiFetch } from "@/lib/api";

export interface ConnectSourceState {
  error?: string;
  ok?: boolean;
}

export async function connectSourceAction(
  _previous: ConnectSourceState,
  formData: FormData,
): Promise<ConnectSourceState> {
  const type = String(formData.get("type") ?? "");
  const name = String(formData.get("name") ?? "").trim() || type.toLowerCase();

  try {
    const payload: Record<string, unknown> = { type, name };
    const externalId = String(formData.get("externalId") ?? "").trim();

    if (externalId) {
      payload.externalId = externalId;
    }

    if (type === "JIRA") {
      const jql = String(formData.get("jql") ?? "").trim();

      payload.config = {
        siteUrl: String(formData.get("siteUrl") ?? "").trim(),
        projectKey: String(formData.get("projectKey") ?? "").trim(),
        issueType: String(formData.get("issueType") ?? "").trim() || "Bug",
        ...(jql ? { jql } : {}),
      };
      payload.secrets = {
        email: String(formData.get("email") ?? "").trim(),
        apiToken: String(formData.get("apiToken") ?? "").trim(),
      };
    } else if (type === "DISCORD") {
      const guildId = String(formData.get("guildId") ?? "").trim();
      const channelIds = String(formData.get("channelIds") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);

      if (channelIds.length === 0) {
        return { error: "Add at least one channel id." };
      }

      payload.config = {
        ...(guildId ? { guildId } : {}),
        channelIds,
      };
      payload.secrets = {
        botToken: String(formData.get("botToken") ?? "").trim(),
      };
    } else if (type === "FRESHDESK") {
      const webhookSecret = String(formData.get("webhookSecret") ?? "").trim();

      payload.config = {
        domain: String(formData.get("domain") ?? "").trim(),
      };
      payload.secrets = {
        apiKey: String(formData.get("apiKey") ?? "").trim(),
        ...(webhookSecret ? { webhookSecret } : {}),
      };
    } else {
      payload.secrets = {
        signingSecret: String(formData.get("signingSecret") ?? "").trim(),
      };
    }

    await apiFetch("/integrations", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch (error) {
    return {
      error:
        error instanceof ApiError
          ? error.message
          : "Could not connect the source.",
    };
  }

  revalidatePath("/sources");
  revalidatePath("/overview");

  return { ok: true };
}

export async function scanSourceAction(formData: FormData): Promise<void> {
  const integrationId = String(formData.get("integrationId") ?? "");

  try {
    await apiFetch(`/integrations/${integrationId}/scan`, { method: "POST" });
  } catch (error) {
    const message =
      error instanceof ApiError ? error.message : "The scan could not start";
    redirect(`/sources?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/sources");
  revalidatePath("/issues");
}
