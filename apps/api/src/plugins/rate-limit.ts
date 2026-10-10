import rateLimit from "@fastify/rate-limit";
import fp from "fastify-plugin";

const rateLimitPlugin = fp(
  async (fastify) => {
    await fastify.register(rateLimit, {
      max: 100,
      timeWindow: "1 minute",
      errorResponseBuilder: (_request, context) => ({
        error: "Too Many Requests",
        message: `Rate limit exceeded. Retry after ${context.ttl}ms`,
        statusCode: 429,
      }),
    });
  },
  { name: "rate-limit" },
);

export default rateLimitPlugin;
