import type { MembershipRole } from "@repo/types";

/** The authenticated actor for the current request (ADR-003). */
export type Principal =
  | {
      type: "user";
      userId: string;
      tenantId: string;
      email: string;
      role: MembershipRole;
    }
  | {
      type: "api_key";
      apiKeyId: string;
      tenantId: string;
      scopes: string[];
    };

export type UserPrincipal = Extract<Principal, { type: "user" }>;
export type ApiKeyPrincipal = Extract<Principal, { type: "api_key" }>;

/** Raw API keys look like `cb_live_<prefix>_<secret>`. */
export const API_KEY_PREFIX = "cb_live_";

export function parseApiKey(
  rawKey: string,
): { prefix: string; secret: string } | null {
  if (!rawKey.startsWith(API_KEY_PREFIX)) {
    return null;
  }

  const rest = rawKey.slice(API_KEY_PREFIX.length);
  const separator = rest.indexOf("_");

  if (separator <= 0 || separator === rest.length - 1) {
    return null;
  }

  return {
    prefix: `${API_KEY_PREFIX}${rest.slice(0, separator)}`,
    secret: rest.slice(separator + 1),
  };
}
