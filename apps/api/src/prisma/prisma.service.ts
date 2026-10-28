import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { type Prisma, prisma } from "@repo/db";

/**
 * Names of the Postgres GUCs the RLS policies read. They must match the
 * policies created by the `add_control_plane_schema` migration exactly.
 */
export const RLS_CONTEXT = {
  TENANT: "app.current_tenant",
  USER: "app.current_user",
  API_KEY_PREFIX: "app.current_api_key_prefix",
  REFRESH_TOKEN_HASH: "app.current_refresh_token_hash",
  INTEGRATION_EXTERNAL_ID: "app.current_integration_external_id",
  INTEGRATION_ID: "app.current_integration_id",
} as const;

export type RlsContextKey = (typeof RLS_CONTEXT)[keyof typeof RLS_CONTEXT];
export type RlsContext = Partial<Record<RlsContextKey, string>>;

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  readonly client = prisma;

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
   * Runs `fn` in a transaction whose RLS context is set to the provided
   * claims. `set_config(..., true)` is transaction-local, which is what makes
   * this safe with connection pooling.
   */
  async withRls<T>(
    context: RlsContext,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const entries = Object.entries(context).filter(
      (entry): entry is [RlsContextKey, string] => typeof entry[1] === "string",
    );

    return this.client.$transaction(async (tx) => {
      for (const [name, value] of entries) {
        await tx.$executeRaw`SELECT set_config(${name}, ${value}, true)`;
      }

      return fn(tx);
    });
  }

  withTenant<T>(
    tenantId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.withRls({ [RLS_CONTEXT.TENANT]: tenantId }, fn);
  }
}
