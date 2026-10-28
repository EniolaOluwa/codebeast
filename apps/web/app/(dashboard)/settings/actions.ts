"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ApiError, apiFetch } from "@/lib/api";

export interface MemberFormState {
  error?: string;
  ok?: boolean;
}

export interface ApiKeyFormState {
  error?: string;
  key?: string;
  name?: string;
}

export async function inviteMemberAction(
  _previous: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "MEMBER");

  try {
    await apiFetch("/members", {
      method: "POST",
      body: JSON.stringify({ email, role }),
    });
  } catch (error) {
    return {
      error:
        error instanceof ApiError ? error.message : "Could not add the member.",
    };
  }

  revalidatePath("/settings/members");
  return { ok: true };
}

async function runSettingsAction(
  path: string,
  method: string,
  back: string,
  body?: Record<string, unknown>,
): Promise<void> {
  try {
    await apiFetch(path, {
      method,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    const message =
      error instanceof ApiError ? error.message : "The action failed";
    redirect(`${back}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(back);
}

export async function updateMemberRoleAction(
  formData: FormData,
): Promise<void> {
  const memberId = String(formData.get("memberId") ?? "");
  const role = String(formData.get("role") ?? "MEMBER");

  await runSettingsAction(
    `/members/${memberId}`,
    "PATCH",
    "/settings/members",
    { role },
  );
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const memberId = String(formData.get("memberId") ?? "");

  await runSettingsAction(
    `/members/${memberId}`,
    "DELETE",
    "/settings/members",
  );
}

export async function createApiKeyAction(
  _previous: ApiKeyFormState,
  formData: FormData,
): Promise<ApiKeyFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const scopes = formData.getAll("scopes").map(String);

  if (scopes.length === 0) {
    return { error: "Pick at least one scope." };
  }

  try {
    const created = await apiFetch<{ key: string; name: string }>("/api-keys", {
      method: "POST",
      body: JSON.stringify({ name: name || "api key", scopes }),
    });

    revalidatePath("/settings/api-keys");
    return { key: created.key, name: created.name };
  } catch (error) {
    return {
      error:
        error instanceof ApiError ? error.message : "Could not create the key.",
    };
  }
}

export async function revokeApiKeyAction(formData: FormData): Promise<void> {
  const keyId = String(formData.get("keyId") ?? "");

  await runSettingsAction(`/api-keys/${keyId}`, "DELETE", "/settings/api-keys");
}
