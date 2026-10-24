import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { Prisma, prisma } from "@repo/db";

import { TenantContext } from "../common/context/tenant-context.ts";

/** Prisma transaction client handed to withTenant callbacks. */
export type TenantDb = Prisma.TransactionClient;

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  readonly client = prisma;

  constructor(private readonly tenantContext: TenantContext) {}

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
    this.logger.log("Prisma connected");
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
    this.logger.log("Prisma disconnected");
  }

  async ping(): Promise<void> {
    await this.client.$queryRaw`SELECT 1`;
  }

  /**
   * Runs `fn` inside a transaction with `app.current_tenant` set, so Postgres
   * row-level security scopes every statement to the request's tenant.
   */
  async withTenant<T>(fn: (tx: TenantDb) => Promise<T>): Promise<T> {
    return this.withTenantId(this.tenantContext.requireTenantId(), fn);
  }

  /**
   * Like withTenant, but for callers that already know the tenant (workers,
   * background jobs) and therefore have no request-scoped AsyncLocalStorage.
   */
  async withTenantId<T>(
    tenantId: string,
    fn: (tx: TenantDb) => Promise<T>,
  ): Promise<T> {
    return this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
      return fn(tx);
    });
  }
}
