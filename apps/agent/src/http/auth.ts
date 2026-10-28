import type {
  FastifyReply,
  FastifyRequest,
  preHandlerAsyncHookHandler,
} from "fastify";

export function createBearerAuth(
  expectedToken: string,
): preHandlerAsyncHookHandler {
  return async function bearerAuth(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (request.url === "/health" || request.url.startsWith("/health?")) {
      return;
    }

    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "missing bearer token" });
    }

    const token = header.slice("Bearer ".length);
    if (token !== expectedToken) {
      return reply.code(401).send({ error: "invalid bearer token" });
    }
  };
}
