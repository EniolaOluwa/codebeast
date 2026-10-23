import { cookies } from "next/headers";

export const API_BASE =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:3001";

export const ACCESS_COOKIE = "cb_access";
export const REFRESH_COOKIE = "cb_refresh";
export const REFRESH_MAX_AGE = 60 * 60 * 24 * 14;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string };
}

/**
 * Server-side fetch against the control plane (ADR-010): the access token
 * lives in an httpOnly cookie and never reaches client components.
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const store = await cookies();
  const accessToken = store.get(ACCESS_COOKIE)?.value;

  const response = await fetch(`${API_BASE}/v1${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const body = (await response.json().catch(() => null)) as
    (T & ErrorEnvelope) | null;

  if (!response.ok) {
    throw new ApiError(
      response.status,
      body?.error?.code ?? `HTTP_${response.status}`,
      body?.error?.message ?? "The request failed",
    );
  }

  return body as T;
}
