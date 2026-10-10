import type { FastifyError } from "fastify";
import fp from "fastify-plugin";

const errorHandlerPlugin = fp(
  async (fastify) => {
    fastify.setErrorHandler((error: FastifyError, request, reply) => {
      const { log } = request;

      if (error.validation) {
        return reply.status(422).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Request validation failed",
            details: error.validation,
          },
        });
      }

      if (error.statusCode && error.statusCode < 500) {
        log.info({ err: error, requestId: request.id }, error.message);
        return reply.status(error.statusCode).send({
          success: false,
          error: {
            code: error.code ?? "ERROR",
            message: error.message,
          },
        });
      }

      log.error({ err: error, requestId: request.id }, "Internal server error");
      return reply.status(500).send({
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected error occurred",
        },
      });
    });
  },
  { name: "error-handler" },
);

export default errorHandlerPlugin;
