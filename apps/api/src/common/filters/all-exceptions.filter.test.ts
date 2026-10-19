import { type ArgumentsHost, HttpException } from "@nestjs/common";
import { ZodValidationException } from "nestjs-zod";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { ConflictError, NotFoundError } from "../errors/errors.ts";
import { AllExceptionsFilter } from "./all-exceptions.filter.ts";

function createHost() {
  const send = vi.fn();
  const status = vi.fn().mockReturnValue({ send });
  const reply = { status };
  const request = { method: "GET", url: "/test" };
  const host = {
    switchToHttp: () => ({
      getResponse: () => reply,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;

  return { host, status, send };
}

function zodError(): z.ZodError {
  const result = z.string().safeParse(123);
  if (result.success) {
    throw new Error("expected parse to fail");
  }
  return result.error;
}

describe("AllExceptionsFilter", () => {
  it("maps an AppException to its status and code", () => {
    const filter = new AllExceptionsFilter();
    const { host, status, send } = createHost();

    filter.catch(new NotFoundError("User"), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(send).toHaveBeenCalledWith({
      success: false,
      error: { code: "NOT_FOUND", message: "User not found" },
    });
  });

  it("maps a ConflictError", () => {
    const filter = new AllExceptionsFilter();
    const { host, status, send } = createHost();

    filter.catch(new ConflictError("Account"), host);

    expect(status).toHaveBeenCalledWith(409);
    expect(send).toHaveBeenCalledWith({
      success: false,
      error: { code: "CONFLICT", message: "Account already exists" },
    });
  });

  it("maps a ZodValidationException to 422 with issue details", () => {
    const filter = new AllExceptionsFilter();
    const { host, status, send } = createHost();

    filter.catch(new ZodValidationException(zodError()), host);

    expect(status).toHaveBeenCalledWith(422);
    const body = send.mock.calls[0]?.[0] as {
      error: { code: string; details: unknown };
    };
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(body.error.details)).toBe(true);
  });

  it("uses the status-code map for a plain HttpException", () => {
    const filter = new AllExceptionsFilter();
    const { host, status, send } = createHost();

    filter.catch(new HttpException({ message: ["a", "b"] }, 400), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(send).toHaveBeenCalledWith({
      success: false,
      error: { code: "BAD_REQUEST", message: "a, b" },
    });
  });

  it("falls back to a generic code for unmapped statuses", () => {
    const filter = new AllExceptionsFilter();
    const { host, status, send } = createHost();

    filter.catch(new HttpException("I am a teapot", 418), host);

    expect(status).toHaveBeenCalledWith(418);
    expect(send).toHaveBeenCalledWith({
      success: false,
      error: { code: "HTTP_418", message: "I am a teapot" },
    });
  });

  it("uses the exception message when the response has none", () => {
    const filter = new AllExceptionsFilter();
    const { host, send } = createHost();
    const exception = new HttpException({ foo: "bar" }, 500);

    filter.catch(exception, host);

    expect(send).toHaveBeenCalledWith({
      success: false,
      error: { code: "INTERNAL_SERVER_ERROR", message: exception.message },
    });
  });

  it("maps unknown errors to a 500 envelope", () => {
    const filter = new AllExceptionsFilter();
    const { host, status, send } = createHost();

    filter.catch(new Error("boom"), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(send).toHaveBeenCalledWith({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred",
      },
    });
  });

  it("handles non-Error throwables", () => {
    const filter = new AllExceptionsFilter();
    const { host, status } = createHost();

    filter.catch("just a string", host);

    expect(status).toHaveBeenCalledWith(500);
  });
});
