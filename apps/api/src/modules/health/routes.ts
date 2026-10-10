import type { FastifyInstance } from "fastify";

import { HealthResponse, ReadinessResponse } from "./schemas.ts";

export default async function healthRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/health",
    {
      schema: {
        description: "Health check endpoint",
        tags: ["health"],
        response: { 200: HealthResponse },
      },
    },
    async (_request, reply) => {
      return reply.status(200).send({
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: fastify.config.NODE_ENV,
        version: "1.0.0",
      });
    },
  );

  fastify.get(
    "/health/ready",
    {
      schema: {
        description: "Readiness check endpoint",
        tags: ["health"],
        response: { 200: ReadinessResponse },
      },
    },
    async (_request, reply) => {
      return reply.status(200).send({
        status: "ready",
        timestamp: new Date().toISOString(),
      });
    },
  );
}
