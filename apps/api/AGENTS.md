# apps/api — Repository Context Layer (RCL)

> Per-repo context for the agent pipeline (root `AGENTS.md` §9). Keep this under 2,000
> tokens. Edit it in a dedicated PR, never alongside a fix.

## 1. What this service is

NestJS 11 API on the Fastify adapter — the **control plane** for CodeBeast. It owns
tenants, integrations, triaged issues, the run state machine, and PR artifacts. The
`agent` service does DeepSeek reasoning; this API orchestrates it and persists state.

- Entrypoint: `src/main.ts` (bootstrap, Fastify plugins, graceful shutdown)
- Wiring: `src/app.module.ts` (global pipe/interceptor/guard/filter + throttler)
- DB: PostgreSQL via shared `@repo/db` Prisma client, wrapped by
  `src/prisma/prisma.service.ts`
- Queue: BullMQ on Redis under `src/workers/*` (planned)
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
  escalate. Do not add ad-hoc retries elsewhere.
- **Logging** uses the injected Nest `Logger` only. No `console.log`.

## 3. Rejected alternatives

- **Passport for auth** — rejected. A single `AuthGuard` accepting JWT or API key keeps
  tenant resolution in one place with less machinery.
- **Relying only on per-query `tenantId` args** — rejected as the sole isolation layer;
  RLS exists to survive a missed filter.
- **Letting Prisma exception shapes reach clients** — rejected; all mapping happens in
  the exception filter.

## 4. Landmines

- Prisma client generates into `packages/db/src/generated/` (gitignored). Run
  `pnpm db:generate` after schema changes or types disappear.
- Dev Postgres runs as **superuser**, which bypasses RLS. Isolation tests must use the
  non-superuser `codebeast_app` role or they pass falsely.
- `main.ts` imports use `.ts` extensions (`rewriteRelativeImportExtensions`). Keep them.
- The global `ThrottlerGuard` is on by default; add stricter `@Throttle` to auth and
  webhook routes.
- Never import from `dist/` — source only.

## 5. Test conventions

- Unit: colocated, mock `PrismaService` via `.overrideProvider` (see
  `src/__tests__/health.test.ts`).
- Integration: `test/integration/**`, Postgres + Redis via Testcontainers.
- Required suites: tenant isolation, webhook signature + idempotency, run transitions.
- `pnpm --filter @repo/api test` needs no DB; coverage floor is 60%.

## 6. Layout

```
src/
  common/   guards, decorators, interceptors, tenant-context, crypto, errors, filters
  config/   env.schema.ts + redis/agent config
  prisma/   PrismaService (+ withTenant transaction helper)
  clients/  agent.client, github.client
  modules/  auth tenants members api-keys repositories integrations webhooks
            issues signals runs plans patches validations pull-requests audit health
  workers/  ingest triage plan code validate pr
```

## 7. Tracking

- `progress.md` — phase status and next action
- `errors.md` — known issues, gotchas, postmortems
- `decisions.md` — architecture decision records (ADRs)
