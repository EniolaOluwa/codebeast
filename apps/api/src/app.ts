import Fastify from "fastify";

import healthRoutes from "./modules/health/routes.ts";
import corePlugins from "./plugins/core.ts";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || "info",
    },
    trustProxy: true,
    connectionTimeout: 10_000,
    keepAliveTimeout: 72_000,
  });

  await app.register(corePlugins);

  await app.register(healthRoutes);

  return app;
}
