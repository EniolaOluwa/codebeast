import "reflect-metadata";

import { type CallHandler, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { lastValueFrom, of } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import { AUDIT_METADATA_KEY } from "./audit.decorator.ts";
import { AuditInterceptor } from "./audit.interceptor.ts";
import type { AuditService } from "./audit.service.ts";

function fakeContext(handler: object): ExecutionContext {
  return {
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => ({
        method: "POST",
        url: "/v1/issues/abc/pr",
        params: { id: "abc" },
        body: { password: "nope", note: "ok" },
        headers: { "user-agent": "vitest" },
        ip: "127.0.0.1",
      }),
    }),
  } as unknown as ExecutionContext;
}

describe("AuditInterceptor", () => {
  it("skips undecorated handlers", async () => {
    const record = vi.fn();
    const reflector = {
      get: vi.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const interceptor = new AuditInterceptor(reflector, {
      record,
    } as unknown as AuditService);

    const handler: CallHandler = { handle: () => of({ ok: true }) };
    await lastValueFrom(interceptor.intercept(fakeContext({}), handler));

    expect(record).not.toHaveBeenCalled();
  });

  it("records after success with redacted body", async () => {
    const record = vi.fn().mockResolvedValue(undefined);
    const handlerFn = () => undefined;
    const reflector = {
      get: vi.fn((key: string) =>
        key === AUDIT_METADATA_KEY
          ? { action: "issue.ship", targetType: "issue", targetParam: "id" }
          : undefined,
      ),
    } as unknown as Reflector;
    const interceptor = new AuditInterceptor(reflector, {
      record,
    } as unknown as AuditService);

    await lastValueFrom(
      interceptor.intercept(fakeContext(handlerFn), {
        handle: () => of({ ok: true }),
      }),
    );

    // Best-effort write is fire-and-forget; flush microtasks.
    await Promise.resolve();
    await Promise.resolve();

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "issue.ship",
        targetType: "issue",
        targetId: "abc",
        metadata: expect.objectContaining({
          body: { password: "[redacted]", note: "ok" },
        }),
      }),
    );
  });

  it("swallows audit write failures", async () => {
    const record = vi.fn().mockRejectedValue(new Error("db down"));
    const handlerFn = () => undefined;
    const reflector = {
      get: vi.fn().mockReturnValue({
        action: "issue.ship",
        targetType: "issue",
        targetParam: "id",
      }),
    } as unknown as Reflector;
    const interceptor = new AuditInterceptor(reflector, {
      record,
    } as unknown as AuditService);

    await expect(
      lastValueFrom(
        interceptor.intercept(fakeContext(handlerFn), {
          handle: () => of({ ok: true }),
        }),
      ),
    ).resolves.toEqual({ ok: true });

    await Promise.resolve();
    await Promise.resolve();
  });
});
