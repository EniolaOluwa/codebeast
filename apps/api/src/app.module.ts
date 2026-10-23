import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import {
  APP_FILTER,
  APP_GUARD,
  APP_INTERCEPTOR,
  APP_PIPE,
  RouterModule,
} from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { ZodSerializerInterceptor, ZodValidationPipe } from "nestjs-zod";

import { AuthGuard } from "./common/auth/auth.guard.ts";
import { TokensModule } from "./common/auth/tokens.module.ts";
import { CryptoModule } from "./common/crypto/crypto.module.ts";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter.ts";
import { TenantContextInterceptor } from "./common/tenant-context/tenant-context.interceptor.ts";
import { TenantContextModule } from "./common/tenant-context/tenant-context.module.ts";
import { validateEnv } from "./config/env.schema.ts";
import { ApiKeysModule } from "./modules/api-keys/api-keys.module.ts";
import { AuthModule } from "./modules/auth/auth.module.ts";
import { HealthModule } from "./modules/health/health.module.ts";
import { IntegrationsModule } from "./modules/integrations/integrations.module.ts";
import { IssuesModule } from "./modules/issues/issues.module.ts";
import { JiraModule } from "./modules/jira/jira.module.ts";
import { MembersModule } from "./modules/members/members.module.ts";
import { OverviewModule } from "./modules/overview/overview.module.ts";
import { RepositoriesModule } from "./modules/repositories/repositories.module.ts";
import { RunsModule } from "./modules/runs/runs.module.ts";
import { WebhooksModule } from "./modules/webhooks/webhooks.module.ts";
import { PrismaModule } from "./prisma/prisma.module.ts";
import { QueuesModule } from "./queues/queues.module.ts";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    // Everything registered here is served under /v1 (health stays at /).
    RouterModule.register([
      { path: "v1", module: AuthModule },
      { path: "v1", module: ApiKeysModule },
      { path: "v1", module: MembersModule },
      { path: "v1", module: RepositoriesModule },
      { path: "v1", module: IntegrationsModule },
      { path: "v1", module: IssuesModule },
      { path: "v1", module: RunsModule },
      { path: "v1", module: OverviewModule },
      { path: "v1", module: WebhooksModule },
    ]),
    PrismaModule,
    CryptoModule,
    TenantContextModule,
    TokensModule,
    QueuesModule,
    HealthModule,
    AuthModule,
    ApiKeysModule,
    MembersModule,
    RepositoriesModule,
    IntegrationsModule,
    WebhooksModule,
    IssuesModule,
    RunsModule,
    JiraModule,
    OverviewModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
