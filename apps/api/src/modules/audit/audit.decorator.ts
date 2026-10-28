import { SetMetadata } from "@nestjs/common";

export const AUDIT_METADATA_KEY = "audit";

export interface AuditMetadata {
  action: string;
  targetType: string;
  /** Route param name that holds the target id (e.g. "id"). */
  targetParam?: string;
}

/**
 * Marks a handler for best-effort audit logging after a successful response.
 * Undecorated handlers are never recorded.
 */
export const Audit = (
  action: string,
  options: { targetType: string; targetParam?: string },
): MethodDecorator =>
  SetMetadata(AUDIT_METADATA_KEY, {
    action,
    targetType: options.targetType,
    ...(options.targetParam ? { targetParam: options.targetParam } : {}),
  } satisfies AuditMetadata);
