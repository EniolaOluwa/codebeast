"use server";

import { redirect } from "next/navigation";

import { ApiError } from "@/lib/api";
import { loginWithPassword, registerAccount } from "@/lib/session";

export interface AuthFormState {
  error?: string;
}

export async function loginAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  try {
    await loginWithPassword(email, password);
  } catch (error) {
    return {
      error:
        error instanceof ApiError
          ? error.message
          : "Could not sign in. Try again.",
    };
  }

  const next = String(formData.get("next") ?? "");
  redirect(next.startsWith("/") ? next : "/issues");
}

export async function registerAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const tenantName = String(formData.get("tenantName") ?? "").trim();

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  try {
    await registerAccount({
      email,
      password,
      ...(name ? { name } : {}),
      ...(tenantName ? { tenantName } : {}),
    });
  } catch (error) {
    return {
      error:
        error instanceof ApiError
          ? error.message
          : "Could not create the account. Try again.",
    };
  }

  redirect("/issues");
}
