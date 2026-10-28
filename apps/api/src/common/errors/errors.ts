import { HttpException, HttpStatus } from "@nestjs/common";

export class AppException extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: HttpStatus,
  ) {
    super(message, status);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppException {
  constructor(subject = "Resource") {
    super("NOT_FOUND", `${subject} not found`, HttpStatus.NOT_FOUND);
  }
}

export class UnauthorizedError extends AppException {
  constructor(message = "Unauthorized access") {
    super("UNAUTHORIZED", message, HttpStatus.UNAUTHORIZED);
  }
}

export class ForbiddenError extends AppException {
  constructor(message = "Forbidden access") {
    super("FORBIDDEN", message, HttpStatus.FORBIDDEN);
  }
}

export class ConflictError extends AppException {
  constructor(subject = "Resource") {
    super("CONFLICT", `${subject} already exists`, HttpStatus.CONFLICT);
  }
}

export class ValidationError extends AppException {
  constructor(message: string) {
    super(
      "VALIDATION_ERROR",
      `Validation failed: ${message}`,
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class BadRequestError extends AppException {
  constructor(message: string) {
    super("BAD_REQUEST", `Bad request: ${message}`, HttpStatus.BAD_REQUEST);
  }
}

export class ExternalServiceError extends AppException {
  constructor(
    public readonly service: string,
    message: string,
  ) {
    super(
      "EXTERNAL_SERVICE_ERROR",
      `${service}: ${message}`,
      HttpStatus.BAD_GATEWAY,
    );
  }
}

export class ExternalDependencyError extends AppException {
  constructor(
    public readonly service: string,
    message: string,
  ) {
    super(
      "EXTERNAL_DEPENDENCY_ERROR",
      `${service}: ${message}`,
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

export class ServiceUnavailableError extends AppException {
  constructor(
    message: string,
    public readonly details?: unknown,
  ) {
    super("SERVICE_UNAVAILABLE", message, HttpStatus.SERVICE_UNAVAILABLE);
  }
}
