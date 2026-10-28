import pino from "pino";

import type { Env } from "../config/env.schema.ts";

export type Logger = pino.Logger;

export function createLogger(env: Pick<Env, "LOG_LEVEL" | "NODE_ENV">): Logger {
  return pino({
    level: env.LOG_LEVEL,
    ...(env.NODE_ENV === "development"
      ? {
          transport: {
            target: "pino/file",
            options: { destination: 1 },
          },
        }
      : {}),
    redact: {
      paths: [
        "token",
        "*.token",
        "checkout.token",
        "Authorization",
        "req.headers.authorization",
      ],
      censor: "[redacted]",
    },
  });
}
