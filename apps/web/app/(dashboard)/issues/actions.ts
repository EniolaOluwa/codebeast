import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ApiError, apiFetch } from "@/lib/api";

async function runIssueAction(
  issueId: string,
  path: string,
  redirectTo?: string,
): Promise<void> {
  const back = `/issues/${issueId}`;

  try {
    await apiFetch(path, { method: "POST" });
  } catch (error) {
    const message =
      error instanceof ApiError ? error.message : "The action failed";
    redirect(`${back}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath(back);
  revalidatePath("/issues");
  revalidatePath("/overview");

  if (redirectTo) {
    redirect(redirectTo);
  }
}

export async function createTicketAction(formData: FormData): Promise<void> {
  const issueId = String(formData.get("issueId") ?? "");
  await runIssueAction(issueId, `/issues/${issueId}/ticket`);
}

export async function shipPrAction(formData: FormData): Promise<void> {
  const issueId = String(formData.get("issueId") ?? "");
  await runIssueAction(issueId, `/issues/${issueId}/pr`);
}

export async function createBothAction(formData: FormData): Promise<void> {
  const issueId = String(formData.get("issueId") ?? "");
  const back = `/issues/${issueId}`;
  const errors: string[] = [];

  for (const path of [`/issues/${issueId}/ticket`, `/issues/${issueId}/pr`]) {
    try {
      await apiFetch(path, { method: "POST" });
    } catch (error) {
      errors.push(
        error instanceof ApiError ? error.message : "The action failed",
      );
    }
  }

  revalidatePath(back);
  revalidatePath("/issues");
  revalidatePath("/overview");

  if (errors.length > 0) {
    redirect(`${back}?error=${encodeURIComponent(errors.join(" · "))}`);
  }
}

export async function retryAction(formData: FormData): Promise<void> {
  const issueId = String(formData.get("issueId") ?? "");
  await runIssueAction(issueId, `/issues/${issueId}/retry`);
}

export async function approveAction(formData: FormData): Promise<void> {
  const issueId = String(formData.get("issueId") ?? "");
  await runIssueAction(issueId, `/issues/${issueId}/approve`);
}

export async function ignoreAction(formData: FormData): Promise<void> {
  const issueId = String(formData.get("issueId") ?? "");
  await runIssueAction(issueId, `/issues/${issueId}/ignore`, "/issues");
}
