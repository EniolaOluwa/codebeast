# apps/api — Repository Context Layer (RCL)

> Per-repo context for the agent pipeline (root `AGENTS.md` §9). Keep this under 2,000
> tokens. Edit it in a dedicated PR, never alongside a fix.

## 1. What this service is

NestJS 11 API on the Fastify adapter — the **control plane** for CodeBeast. It owns
tenants, integrations, triaged issues, the run state machine, and PR artifacts. The
`agent` service does LLM reasoning; this API orchestrates it and persists state.

- Entrypoint: `src/main.ts` (bootstrap, Fastify plugins, metrics hook, Swagger)
- Wiring: `src/app.module.ts` (global pipe/interceptor/guard/filter + Redis throttler)
- DB: PostgreSQL via shared `@repo/db` Prisma client, wrapped by
  `src/prisma/prisma.service.ts`
- Queue: BullMQ on Redis under `src/modules/runs/workers.service.ts` +
  `src/queues/*` (`ingest|triage|plan|code|validate|pr|ticket|scan|maintenance`)
- Shared Redis: `src/redis/*` for readiness, throttler storage, metrics scrapes
  (BullMQ keeps its own connections)
- Tests: vitest, colocated `*.test.ts`; integration in `test/integration/`

## 2. Non-obvious decisions (do not "fix" these)

- **Zod at the boundary.** All request/response validation uses `nestjs-zod`
  (`createZodDto` + global `ZodValidationPipe`). Never read raw `request.body`. Wire
  contracts live in `@repo/types` and change there first.
- **Single error envelope.** `AllExceptionsFilter` emits
  `{ success: false, error: { code, message, details? } }`. Throw typed errors from
  `src/common/errors/errors.ts`; never string literals.
- **Tenant isolation is two layers.** Repository code always filters by `tenantId`, and
  Postgres RLS (`FORCE ROW LEVEL SECURITY` + `app.current_tenant`) is the backstop.
  Tenant flows through AsyncLocalStorage; DB access goes through
  `PrismaService.withTenant(...)`.
- **Migrations are additive-only** and never edited in place. They are deny-listed for
  the coder agent (root `AGENTS.md` §5.1) and must be human-merged.
- **Run state machine** encodes root `AGENTS.md` §6: max 3 attempts, one replan, then
  escalate. Do not add ad-hoc retries elsewhere. The stalled-run reaper uses the same
  machine.
- **Audit is best-effort.** `@Audit` + `AuditInterceptor` (ADR-015); never fail the
  primary request because an audit write failed. Automation uses `actorType: SYSTEM`.
- **Cross-tenant maintenance** uses SECURITY DEFINER helpers only (ADR-013):
  `codebeast_stalled_runs`, `codebeast_purge_raw_payloads`. Do not invent new bypasses.
- **Logging** uses the injected Nest `Logger` only. No `console.log`.

## 3. Rejected alternatives

- **Passport for auth** — rejected. A single `AuthGuard` accepting JWT or API key keeps
  tenant resolution in one place with less machinery.
- **Relying only on per-query `tenantId` args** — rejected as the sole isolation layer;
  RLS exists to survive a missed filter.
- **Letting Prisma exception shapes reach clients** — rejected; all mapping happens in
  the exception filter.
- **In-memory rate limits in production** — rejected (ADR-014); Redis storage is required
  outside `NODE_ENV=test`.

## 4. Landmines

- Prisma client generates into `packages/db/src/generated/` (gitignored). Run
  `pnpm db:generate` after schema changes or types disappear.
- Dev Postgres runs as **superuser**, which bypasses RLS. Isolation tests must use the
  non-superuser `codebeast_app` role or they pass falsely.
- `main.ts` imports use `.ts` extensions (`rewriteRelativeImportExtensions`). Keep them.
- Named throttlers (`default`, `authEmail`, `authIp`, `webhook`) — do not reintroduce
  IP-only login limits.
- Never import from `dist/` — source only.

## 5. Test conventions

- Unit: colocated, mock `PrismaService` via `.overrideProvider` (see
  `src/__tests__/health.test.ts`). Override `REDIS_CLIENT` when the module graph loads.
- Integration: `test/integration/**`, Postgres + Redis via Testcontainers.
- Required suites: tenant isolation, webhook signature + idempotency, run transitions,
  maintenance (reaper + janitor as `codebeast_app`).
- `pnpm --filter @repo/api test` needs no DB; coverage floor is 60%.

## 6. Layout

```
src/
  common/   guards, decorators, interceptors, tenant-context, crypto, errors, filters, throttler
  config/   env.schema.ts
  prisma/   PrismaService (+ withTenant / withRls)
  redis/    shared REDIS_CLIENT
  clients/  agent, github, jira, discord, freshdesk
  modules/  auth tenants members api-keys repositories integrations webhooks
            issues runs rules overview audit health metrics maintenance
  queues/   BullMQ publisher + queue types
```

## 7. Tracking

- `progress.md` — phase status and next action
- `errors.md` — known issues, gotchas, postmortems
- `decisions.md` — architecture decision records (ADRs)
