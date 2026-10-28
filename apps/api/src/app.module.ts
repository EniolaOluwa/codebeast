import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
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
import { RedisThrottlerStorage } from "./common/throttler/redis-throttler.storage.ts";
import { validateEnv } from "./config/env.schema.ts";
import { ApiKeysModule } from "./modules/api-keys/api-keys.module.ts";
import { AuditInterceptor } from "./modules/audit/audit.interceptor.ts";
import { AuditModule } from "./modules/audit/audit.module.ts";
import { AuthModule } from "./modules/auth/auth.module.ts";
import { HealthModule } from "./modules/health/health.module.ts";
import { IntegrationsModule } from "./modules/integrations/integrations.module.ts";
import { IssuesModule } from "./modules/issues/issues.module.ts";
import { JiraModule } from "./modules/jira/jira.module.ts";
import { MembersModule } from "./modules/members/members.module.ts";
import { MetricsModule } from "./modules/metrics/metrics.module.ts";
import { OverviewModule } from "./modules/overview/overview.module.ts";
import { RepositoriesModule } from "./modules/repositories/repositories.module.ts";
import { RulesModule } from "./modules/rules/rules.module.ts";
import { RunsModule } from "./modules/runs/runs.module.ts";
import { WebhooksModule } from "./modules/webhooks/webhooks.module.ts";
import { PrismaModule } from "./prisma/prisma.module.ts";
import { QueuesModule } from "./queues/queues.module.ts";
import { RedisModule } from "./redis/redis.module.ts";

function isAuthCredentialRoute(path: string): boolean {
  return (
    path.includes("/auth/login") ||
    path.includes("/auth/register") ||
    path.endsWith("/login") ||
    path.endsWith("/register")
  );
}

function isWebhookRoute(path: string): boolean {
  return path.includes("/webhooks");
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    RedisModule,
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [RedisThrottlerStorage, ConfigService],
      useFactory: (storage: RedisThrottlerStorage, config: ConfigService) => {
        const webhookLimit = config.getOrThrow<number>(
          "WEBHOOK_RATE_LIMIT_PER_MIN",
        );
        // Unit/integration suites stay Redis-free for HTTP throttling; production
        // and local-dev share limits across instances via Redis.
        const resolvedStorage =
          config.getOrThrow<string>("NODE_ENV") === "test"
            ? undefined
            : storage;
        return {
          ...(resolvedStorage ? { storage: resolvedStorage } : {}),
          throttlers: [
            {
              name: "default",
              ttl: 60_000,
              limit: 100,
              skipIf: (context) => {
                const req = context
                  .switchToHttp()
                  .getRequest<{ url?: string }>();
                const path = req.url ?? "";
                return isAuthCredentialRoute(path) || isWebhookRoute(path);
              },
            },
            {
              name: "authEmail",
              ttl: 60_000,
              limit: 5,
              skipIf: (context) => {
                const req = context
                  .switchToHttp()
                  .getRequest<{ url?: string }>();
                return !isAuthCredentialRoute(req.url ?? "");
              },
              getTracker: (req: { ip?: string; body?: { email?: string } }) => {
                const email =
                  typeof req.body?.email === "string"
                    ? req.body.email.trim().toLowerCase()
                    : "";
                return `${req.ip ?? "unknown"}:${email}`;
              },
            },
            {
              name: "authIp",
              ttl: 60_000,
              limit: 20,
              skipIf: (context) => {
                const req = context
                  .switchToHttp()
                  .getRequest<{ url?: string }>();
                return !isAuthCredentialRoute(req.url ?? "");
              },
            },
            {
              name: "webhook",
              ttl: 60_000,
              limit: webhookLimit,
              skipIf: (context) => {
                const req = context
                  .switchToHttp()
                  .getRequest<{ url?: string }>();
                return !isWebhookRoute(req.url ?? "");
              },
              getTracker: (req: {
                params?: { integrationId?: string; source?: string };
                url?: string;
              }) => {
                const integrationId = req.params?.integrationId ?? "shared";
                const path = req.url ?? "";
                const provider =
                  path.match(/\/webhooks\/([^/?]+)/)?.[1] ?? "unknown";
                return `${provider}:${integrationId}`;
              },
            },
          ],
        };
      },
    }),
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
      { path: "v1", module: RulesModule },
      { path: "v1", module: WebhooksModule },
      { path: "v1", module: AuditModule },
    ]),
    PrismaModule,
    CryptoModule,
    TenantContextModule,
    TokensModule,
    QueuesModule,
    MetricsModule,
    AuditModule,
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
    RulesModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
