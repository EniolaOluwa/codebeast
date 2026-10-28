const SENSITIVE_KEYS = new Set([
  "password",
  "token",
  "secret",
  "credentials",
  "authorization",
  "refreshToken",
  "accessToken",
  "apiKey",
  "apiToken",
  "botToken",
  "privateKey",
]);

/**
 * Deep-clone a body for audit metadata, replacing sensitive keys with
 * "[redacted]". Non-plain objects are dropped.
 */
export function redactForAudit(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || value === undefined) {
    return value === undefined ? undefined : value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => redactForAudit(item, depth + 1));
  }

  if (typeof value !== "object") {
    if (typeof value === "string" && value.length > 500) {
      return `${value.slice(0, 500)}…`;
    }
    return value;
  }

  if (Object.getPrototypeOf(value) !== Object.prototype) {
    return undefined;
  }

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (
      SENSITIVE_KEYS.has(key) ||
      /password|secret|token|credential/i.test(key)
    ) {
      out[key] = "[redacted]";
    } else {
      out[key] = redactForAudit(child, depth + 1);
    }
  }
  return out;
}
