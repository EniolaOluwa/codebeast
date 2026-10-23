import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import { type Observable } from "rxjs";

import type { Principal } from "../auth/principal.ts";
import { TenantContextService } from "./tenant-context.service.ts";

/**
 * Wraps handler execution in the ambient tenant context so logging and audit
 * code can read it without threading ids through signatures. Database access
 * still uses explicit `withTenant`/`withRls` calls — this is not an isolation
 * mechanism.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly tenantContext: TenantContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<{ principal?: Principal }>();

    const principal = request.principal;

    if (!principal) {
      return next.handle();
    }

    const ambient =
      principal.type === "user"
        ? {
            tenantId: principal.tenantId,
            userId: principal.userId,
            role: principal.role,
          }
        : {
            tenantId: principal.tenantId,
            apiKeyId: principal.apiKeyId,
          };

    // `next.handle()` must be built *inside* the context: the handler's async
    // continuations inherit the store from the frame in which it is created.
    return this.tenantContext.run(ambient, () => next.handle());
  }
}
