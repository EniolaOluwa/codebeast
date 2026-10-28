import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

import type {
  AuthenticatedRequest,
  RequestContext,
} from "../context/request-context.ts";

/** Injects the resolved request context (tenant, actor, role, scopes). */
export const CurrentContext = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestContext | undefined =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().auth,
);
