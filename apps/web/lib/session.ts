import { cookies } from "next/headers";

import {
  ACCESS_COOKIE,
  API_BASE,
  ApiError,
  REFRESH_COOKIE,
  REFRESH_MAX_AGE,
} from "./api";

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string };
}

async function requestTokens(
  path: string,
  body: Record<string, unknown>,
): Promise<AuthTokens> {
  const response = await fetch(`${API_BASE}/v1${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    const parsed = (await response
      .json()
      .catch(() => null)) as ErrorEnvelope | null;

    throw new ApiError(
      response.status,
      parsed?.error?.code ?? `HTTP_${response.status}`,
      parsed?.error?.message ?? "Authentication failed",
    );
  }

  return (await response.json()) as AuthTokens;
}

async function persistSession(tokens: AuthTokens): Promise<void> {
  const store = await cookies();

  store.set(ACCESS_COOKIE, tokens.accessToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: tokens.expiresIn,
  });
  store.set(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: REFRESH_MAX_AGE,
  });
}

export async function loginWithPassword(
  email: string,
  password: string,
): Promise<void> {
  await persistSession(await requestTokens("/auth/login", { email, password }));
}

export async function registerAccount(input: {
  email: string;
  password: string;
  name?: string;
  tenantName?: string;
}): Promise<void> {
  await persistSession(await requestTokens("/auth/register", input));
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  const refreshToken = store.get(REFRESH_COOKIE)?.value;

  if (refreshToken) {
    await fetch(`${API_BASE}/v1/auth/logout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => undefined);
  }

  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}
