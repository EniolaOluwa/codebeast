import createError from "@fastify/error";

export const NotFoundError = createError(
  "NOT_FOUND",
  "Resource %s not found",
  404,
);

export const UnauthorizedError = createError(
  "UNAUTHORIZED",
  "Unauthorized access",
  401,
);

export const ForbiddenError = createError(
  "FORBIDDEN",
  "Forbidden access",
  403,
);

export const ConflictError = createError(
  "CONFLICT",
  "%s already exists",
  409,
);

export const ValidationError = createError(
  "VALIDATION_ERROR",
  "Validation failed: %s",
  422,
);

export const BadRequestError = createError(
  "BAD_REQUEST",
  "Bad request: %s",
  400,
);
