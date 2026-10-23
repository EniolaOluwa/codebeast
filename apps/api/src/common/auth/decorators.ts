import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
} from "@nestjs/common";
import type { ApiKeyScope, MembershipRole } from "@repo/types";

import { UnauthorizedError } from "../errors/errors.ts";
import type { Principal } from "./principal.ts";

export const IS_PUBLIC_KEY = "codebeast:isPublic";
export const ROLES_KEY = "codebeast:roles";
export const SCOPES_KEY = "codebeast:scopes";

/** Endpoint is reachable without authentication (login, webhooks, health). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Requires a user session whose membership role is one of these. */
export const Roles = (...roles: MembershipRole[]) =>
  SetMetadata(ROLES_KEY, roles);

/** Requires an API key carrying one of these scopes. */
export const Scopes = (...scopes: ApiKeyScope[]) =>
  SetMetadata(SCOPES_KEY, scopes);

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal => {
    const request = context
      .switchToHttp()
      .getRequest<{ principal?: Principal }>();

    if (!request.principal) {
      throw new UnauthorizedError("No authenticated principal");
    }

    return request.principal;
  },
);
