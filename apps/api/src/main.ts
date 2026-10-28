import "reflect-metadata";
import "dotenv/config";

import helmet from "@fastify/helmet";
import underPressure from "@fastify/under-pressure";
import { Logger, type LogLevel, VersioningType } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { cleanupOpenApiDoc } from "nestjs-zod";

import { AppModule } from "./app.module.ts";

const LOG_LEVELS: Record<string, LogLevel[]> = {
  verbose: ["fatal", "error", "warn", "log", "debug", "verbose"],
  debug: ["fatal", "error", "warn", "log", "debug"],
  info: ["fatal", "error", "warn", "log"],
  warn: ["fatal", "error", "warn"],
  error: ["fatal", "error"],
};

function resolveLogLevels(): LogLevel[] {
  const level = process.env.LOG_LEVEL ?? "info";
  return LOG_LEVELS[level] ?? ["fatal", "error", "warn", "log"];
}

async function bootstrap(): Promise<void> {
  const adapter = new FastifyAdapter({
    trustProxy: true,
    connectionTimeout: 10_000,
    keepAliveTimeout: 72_000,
  });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
    { logger: resolveLogLevels(), rawBody: true },
  );

  const config = app.get(ConfigService);
  const logger = new Logger("Bootstrap");
  const nodeEnv = config.getOrThrow<string>("NODE_ENV");
  const port = config.getOrThrow<number>("PORT");
  const host = config.getOrThrow<string>("HOST");

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: "1",
  });

  app.enableCors({
    origin: config.getOrThrow<string>("CORS_ORIGIN").split(","),
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  });

  const fastify = app.getHttpAdapter().getInstance();

  // Register plugins on the raw Fastify instance without awaiting: awaiting
  // before `app.init()` triggers Fastify's ready sequence early and deadlocks
  // Nest's middie registration during `listen`.
  fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "validator.swagger.io"],
        objectSrc: ["'none'"],
      },
    },
  });

  fastify.register(underPressure, {
    maxEventLoopDelay: 1000,
    maxHeapUsedBytes: 1024 * 1024 * 1024,
    maxRssBytes: 1024 * 1024 * 1024,
    healthCheck: async () => ({ status: "ok" }),
    healthCheckInterval: 5000,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle("CodeBeast API")
    .setDescription("CodeBeast API — autonomous SRE platform")
    .setVersion("1.0.0")
    .addServer(
      nodeEnv === "production"
        ? "https://api.codebeast.app"
        : `http://localhost:${port}`,
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api-docs", app, cleanupOpenApiDoc(document));

  let isShuttingDown = false;

  fastify.addHook("onRequest", async (_request, reply) => {
    if (isShuttingDown) {
      reply.header("Connection", "close");
      await reply.status(503).send({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Service is shutting down",
        },
      });
    }
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.log(`Shutdown signal received: ${signal}`);
    isShuttingDown = true;

    const forceExitTimeout = setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, 30_000);
    forceExitTimeout.unref();

    try {
      await app.close();
      clearTimeout(forceExitTimeout);
      logger.log("Server closed gracefully");
      process.exit(0);
    } catch (error) {
      logger.error(
        "Error during shutdown",
        error instanceof Error ? error.stack : String(error),
      );
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  await app.listen(port, host);
  logger.log(`API server running at http://${host}:${port}`);
  logger.log(`Swagger docs at http://${host}:${port}/api-docs`);
}

await bootstrap();
