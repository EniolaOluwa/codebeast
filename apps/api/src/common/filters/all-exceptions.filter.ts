import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ZodValidationException } from "nestjs-zod";
import { ZodError } from "zod";

import { AppException, ServiceUnavailableError } from "../errors/errors.ts";

const STATUS_CODES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: "BAD_REQUEST",
  [HttpStatus.UNAUTHORIZED]: "UNAUTHORIZED",
  [HttpStatus.FORBIDDEN]: "FORBIDDEN",
  [HttpStatus.NOT_FOUND]: "NOT_FOUND",
  [HttpStatus.CONFLICT]: "CONFLICT",
  [HttpStatus.UNPROCESSABLE_ENTITY]: "VALIDATION_ERROR",
  [HttpStatus.TOO_MANY_REQUESTS]: "RATE_LIMITED",
  [HttpStatus.SERVICE_UNAVAILABLE]: "SERVICE_UNAVAILABLE",
  [HttpStatus.INTERNAL_SERVER_ERROR]: "INTERNAL_SERVER_ERROR",
};

interface ErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

interface NormalizedError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const { status, code, message, details } = this.normalize(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status} (${code})`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.log(
        `${request.method} ${request.url} -> ${status} (${code})`,
      );
    }

    const body: ErrorEnvelope = {
      success: false,
      error: { code, message, ...(details === undefined ? {} : { details }) },
    };

    void reply.status(status).send(body);
  }

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof ZodValidationException) {
      const zodError = exception.getZodError();
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: zodError instanceof ZodError ? zodError.issues : zodError,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const code =
        exception instanceof AppException
          ? exception.code
          : (STATUS_CODES[status] ?? `HTTP_${status}`);
      const details =
        exception instanceof ServiceUnavailableError
          ? exception.details
          : undefined;

      return {
        status,
        code,
        message: this.messageFrom(response, exception),
        ...(details === undefined ? {} : { details }),
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred",
    };
  }

  private messageFrom(
    response: string | object,
    exception: HttpException,
  ): string {
    if (typeof response === "string") {
      return response;
    }

    if (response !== null && "message" in response) {
      const raw = (response as { message: unknown }).message;
      return Array.isArray(raw) ? raw.join(", ") : String(raw);
    }

    return exception.message;
  }
}
