import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { ZodSerializerInterceptor, ZodValidationPipe } from "nestjs-zod";

import { ClientsModule } from "./clients/clients.module.ts";
import { AuthGuard } from "./common/auth/auth.guard.ts";
import { TenantContextInterceptor } from "./common/context/tenant-context.interceptor.ts";
import { CoreModule } from "./common/core.module.ts";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter.ts";
import { validateEnv } from "./config/env.schema.ts";
import { ApiKeysModule } from "./modules/api-keys/api-keys.module.ts";
import { AuditModule } from "./modules/audit/audit.module.ts";
import { AuthModule } from "./modules/auth/auth.module.ts";
import { HealthModule } from "./modules/health/health.module.ts";
import { IntegrationsModule } from "./modules/integrations/integrations.module.ts";
import { IssuesModule } from "./modules/issues/issues.module.ts";
import { MembersModule } from "./modules/members/members.module.ts";
import { RepositoriesModule } from "./modules/repositories/repositories.module.ts";
import { RunsModule } from "./modules/runs/runs.module.ts";
import { TenantsModule } from "./modules/tenants/tenants.module.ts";
import { WebhooksModule } from "./modules/webhooks/webhooks.module.ts";
import { PrismaModule } from "./prisma/prisma.module.ts";
import { NoopQueueModule } from "./workers/noop-queue.module.ts";
import { QueueModule } from "./workers/queue.module.ts";

const queueEnabled = process.env.QUEUE_ENABLED !== "false";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    CoreModule,
    ClientsModule,
    PrismaModule,
    HealthModule,
    AuthModule,
    TenantsModule,
    MembersModule,
    ApiKeysModule,
    RepositoriesModule,
    IntegrationsModule,
    RunsModule,
    IssuesModule,
    WebhooksModule,
    AuditModule,
    queueEnabled ? QueueModule : NoopQueueModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
