import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import type { Observable } from "rxjs";

import type { AuthenticatedRequest } from "./request-context.ts";
import { TenantContext } from "./tenant-context.ts";

/**
 * Wraps the request lifecycle in an AsyncLocalStorage scope so deeper layers
 * (services, PrismaService.withTenant) can read the resolved tenant without
 * threading it through every call. Runs after AuthGuard, which attaches
 * `request.auth`.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly tenantContext: TenantContext) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.auth) {
      return next.handle();
    }

    return this.tenantContext.run(request.auth, () => next.handle());
  }
}
