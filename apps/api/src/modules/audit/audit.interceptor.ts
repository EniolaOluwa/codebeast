import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import { type Observable, tap } from "rxjs";

import { AUDIT_METADATA_KEY, type AuditMetadata } from "./audit.decorator.ts";
import { AuditService } from "./audit.service.ts";
import { redactForAudit } from "./redact.ts";

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditMetadata | undefined>(
      AUDIT_METADATA_KEY,
      context.getHandler(),
    );

    if (!meta) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();

    return next.handle().pipe(
      tap({
        next: () => {
          void this.write(meta, request).catch((error: unknown) => {
            this.logger.warn(
              `audit write failed for ${meta.action}: ${error instanceof Error ? error.message : String(error)}`,
            );
          });
        },
      }),
    );
  }

  private async write(
    meta: AuditMetadata,
    request: FastifyRequest,
  ): Promise<void> {
    const params = request.params as Record<string, string | undefined>;
    const targetId = meta.targetParam
      ? (params[meta.targetParam] ?? null)
      : null;

    const ip =
      (typeof request.headers["x-forwarded-for"] === "string"
        ? request.headers["x-forwarded-for"].split(",")[0]?.trim()
        : undefined) ??
      request.ip ??
      null;

    const userAgent =
      typeof request.headers["user-agent"] === "string"
        ? request.headers["user-agent"]
        : null;

    await this.audit.record({
      action: meta.action,
      targetType: meta.targetType,
      targetId,
      metadata: {
        method: request.method,
        path: request.url,
        body: redactForAudit(request.body),
      },
      ip,
      userAgent,
    });
  }
}
