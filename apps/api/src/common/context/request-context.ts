import type { ActorType, ApiKeyScope, Role } from "@repo/types";

export interface RequestContext {
  tenantId: string;
  actorType: ActorType;
  actorId?: string;
  role?: Role;
  scopes?: ApiKeyScope[];
}

export interface AuthenticatedRequest {
  auth?: RequestContext;
}
