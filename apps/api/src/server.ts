import { buildApp } from "./app.ts";

const app = await buildApp();

const port = Number(app.config.PORT);
const host = app.config.HOST;

let isShuttingDown = false;

app.addHook("onRequest", async (request, reply) => {
  if (isShuttingDown) {
    reply.header("Connection", "close");
    reply.status(503).send({
      success: false,
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "Service is shutting down",
      },
    });
  }
});

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "Shutdown signal received");
  isShuttingDown = true;

  const forceExitTimeout = setTimeout(() => {
    app.log.error("Forced shutdown after timeout");
    process.exit(1);
  }, 30_000);

  try {
    await app.close();
    app.log.info("Server closed gracefully");
    clearTimeout(forceExitTimeout);
    process.exit(0);
  } catch (err) {
    app.log.error(err, "Error during shutdown");
    process.exit(1);
  }
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

try {
  await app.listen({ port, host });
  app.log.info(`API server running at http://${host}:${port}`);
  app.log.info(`Swagger docs at http://${host}:${port}/api-docs`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
