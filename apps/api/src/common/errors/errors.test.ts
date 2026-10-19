import { describe, expect, it } from "vitest";

import {
  AppException,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "./errors.ts";

describe("AppException", () => {
  it("carries the code, message and status", () => {
    const error = new AppException("TEAPOT", "I am a teapot", 418);
    expect(error.code).toBe("TEAPOT");
    expect(error.message).toBe("I am a teapot");
    expect(error.getStatus()).toBe(418);
    expect(error.name).toBe("AppException");
  });

  it("uses the concrete subclass name", () => {
    expect(new NotFoundError().name).toBe("NotFoundError");
  });
});

describe("typed errors", () => {
  it("NotFoundError", () => {
    const error = new NotFoundError("User");
    expect(error.code).toBe("NOT_FOUND");
    expect(error.message).toBe("User not found");
    expect(error.getStatus()).toBe(404);
  });

  it("UnauthorizedError", () => {
    const error = new UnauthorizedError();
    expect(error.code).toBe("UNAUTHORIZED");
    expect(error.message).toBe("Unauthorized access");
    expect(error.getStatus()).toBe(401);
  });

  it("ForbiddenError", () => {
    const error = new ForbiddenError();
    expect(error.code).toBe("FORBIDDEN");
    expect(error.message).toBe("Forbidden access");
    expect(error.getStatus()).toBe(403);
  });

  it("ConflictError", () => {
    const error = new ConflictError("Account");
    expect(error.code).toBe("CONFLICT");
    expect(error.message).toBe("Account already exists");
    expect(error.getStatus()).toBe(409);
  });

  it("ValidationError", () => {
    const error = new ValidationError("email is invalid");
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toBe("Validation failed: email is invalid");
    expect(error.getStatus()).toBe(422);
  });

  it("BadRequestError", () => {
    const error = new BadRequestError("missing field");
    expect(error.code).toBe("BAD_REQUEST");
    expect(error.message).toBe("Bad request: missing field");
    expect(error.getStatus()).toBe(400);
  });
});
