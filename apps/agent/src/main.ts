import path from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";
import Fastify from "fastify";

import { validateEnv } from "./config/env.schema.ts";
import { createBearerAuth } from "./http/auth.ts";
import { registerRoutes } from "./http/routes.ts";
import { createLogger } from "./lib/logger.ts";
import { ChatClient } from "./llm/chat.client.ts";
import { WorkspaceManager } from "./repo/workspace.ts";

// Load apps/agent/.env regardless of turbo's cwd.
loadEnv({
  path: path.join(path.dirname(fileURLToPath(import.meta.url)), "../.env"),
});

async function main(): Promise<void> {
  const env = validateEnv(process.env);
  const logger = createLogger(env);

  if (env.LLM_API_KEY.startsWith("dev-only-")) {
    logger.warn(
      "LLM_API_KEY is using the dev placeholder — plan/code calls will fail until apps/agent/.env is configured",
    );
  }

  const app = Fastify({
    logger: false,
    bodyLimit: 8 * 1024 * 1024,
  });

  app.addHook("preHandler", createBearerAuth(env.AGENT_SERVICE_TOKEN));

  const client = new ChatClient({
    baseUrl: env.LLM_BASE_URL,
    apiKey: env.LLM_API_KEY,
    logger,
  });

  const workspaces = new WorkspaceManager({
    root: env.WORKSPACE_ROOT,
    ttlMs: env.WORKSPACE_TTL_MS,
    logger,
  });

  await registerRoutes(app, { env, logger, client, workspaces });

  await app.listen({ port: env.PORT, host: env.HOST });
  logger.info({ port: env.PORT, host: env.HOST }, "agent service listening");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console -- bootstrap failure before logger
  console.error(error);
  process.exit(1);
});
