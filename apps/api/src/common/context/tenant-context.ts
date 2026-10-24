import { AsyncLocalStorage } from "node:async_hooks";

import { Injectable } from "@nestjs/common";

import { UnauthorizedError } from "../errors/errors.ts";
import type { RequestContext } from "./request-context.ts";

@Injectable()
export class TenantContext {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  run<T>(context: RequestContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  get(): RequestContext | undefined {
    return this.storage.getStore();
  }

  require(): RequestContext {
    const context = this.storage.getStore();
    if (!context) {
      throw new UnauthorizedError("No tenant context for this request");
    }
    return context;
  }

  requireTenantId(): string {
    return this.require().tenantId;
  }
}
