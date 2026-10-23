import { AsyncLocalStorage } from "node:async_hooks";

import { Injectable } from "@nestjs/common";
import type { MembershipRole } from "@repo/types";

export interface RequestContext {
  tenantId: string;
  userId?: string;
  apiKeyId?: string;
  role?: MembershipRole;
}

/**
 * Request-scoped context for everything that should not have to thread a
 * tenant id through call signatures (logging, audit). Database access always
 * goes through `PrismaService.withRls`/`withTenant` with an explicit id —
 * this service is not an isolation mechanism.
 */
@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  run<T>(context: RequestContext, fn: () => T): T {
    return this.storage.run(context, fn);
  }

  get(): RequestContext | undefined {
    return this.storage.getStore();
  }

  requireTenantId(): string {
    const store = this.storage.getStore();

    if (!store) {
      throw new Error("No tenant context is active for this operation");
    }

    return store.tenantId;
  }
}
