# apps/api — Architecture Decision Records (ADRs)

Append-only log of decisions that shape `apps/api`. One section per decision; supersede
rather than rewrite. Status: `Accepted`, `Superseded`, `Proposed`.

## ADR-001 — Control-plane MVP scope

- **Status:** Accepted
- **Context:** `apps/api` currently has only health, env validation, Prisma wrapper, and
  an exception filter. Root `AGENTS.md` defines the pipeline contract but not the full
  product API.
- **Decision:** First milestone is the control-plane MVP — tenants/API keys,
  repositories, Sentry + GitHub webhooks, Slack ingestion, issues, runs/attempts,
  planner→coder→validator orchestration, and PR records. Jira, full audit, and metrics
  follow in later phases.
- **Consequences:** Pipeline orchestration must exist before integrations are "complete";
  agent wire contract gates Phase 4.

## ADR-002 — Additive Prisma schema + RLS, human-merged migrations

- **Status:** Accepted
- **Context:** The domain needs many new tenant-scoped tables, but root `AGENTS.md` §5.1
  deny-lists `packages/db/prisma/migrations/**` for the coder agent.
- **Decision:** Design the tenant-scoped schema now, ship additive migrations with
  `FORCE ROW LEVEL SECURITY` and a non-superuser `codebeast_app` role, and treat
  migrations as human-authored/merged. Code also filters by `tenantId` as defense in
  depth.
- **Consequences:** The agent pipeline cannot author schema changes; see `errors.md`
  E-001. Dev superuser bypasses RLS (E-002).

## ADR-003 — Auth: JWT for humans, hashed API keys for machines

- **Status:** Accepted
- **Context:** The Next.js dashboard needs a session; webhooks/CLI need machine creds.
- **Decision:** Short-lived JWT access tokens + rotating hashed refresh tokens for the
  dashboard; `cb_live_<prefix>_<secret>` API keys stored as sha256 hashes with scopes for
  machines. A single `AuthGuard` resolves the tenant for both.
- **Consequences:** No Passport dependency. Tenant resolution is centralized. Secrets
  encrypted at rest with AES-256-GCM (`CryptoService`).

## ADR-004 — BullMQ + Redis for the agent pipeline

- **Status:** Accepted
- **Context:** Root `AGENTS.md` §3 names `src/workers/*` as BullMQ consumers.
- **Decision:** Use BullMQ on Redis with queues `ingest`, `triage`, `plan`, `code`,
  `validate`, `pr`. Run state and attempt accounting live in Postgres; jobs are
  idempotent by `runId:stage:attempt`.
- **Consequences:** New infra (Redis) needed in dev compose and env. Retry/backoff and
  the max-3-attempts/escalation rule from root §6.4 are implemented in workers.

## ADR-005 — GitHub App for PR creation

- **Status:** Accepted
- **Decision:** Authenticate to GitHub with a GitHub App; exchange installation tokens
  (`@octokit/auth-app`) scoped per repository. Store a `GitHubInstallation` record.
- **Consequences:** Production-grade, multi-tenant-friendly; more setup than a PAT. A
  stub client is acceptable until the app is registered.

## ADR-006 — Slack as the first support channel

- **Status:** Accepted
- **Decision:** Ingest customer messages from Slack first (webhook + bot token,
  `@slack/web-api`). Keep a provider-neutral normalized message schema so Zendesk/others
  can be added without touching `Issue`/`IssueSignal`.
- **Consequences:** `Integration.type` includes `SLACK`; signature verification per
  provider.

## ADR-007 — Wire contracts stay in `@repo/types`

- **Status:** Accepted
- **Decision:** Convert `@repo/types` from plain interfaces to Zod schemas and add the
  wire contracts there (`errorEnvelope`, `paginatedResponse`, `issueContext`,
  `planBlueprint`, `patchSubmission`, `validationResult`, `runStatus`,
  `webhookEnvelope`). API DTOs derive via `createZodDto`.
- **Consequences:** Root `AGENTS.md` §3 says wire formats change here first. Avoids a
  package rename and the associated import/lockfile churn.

## ADR-008 — Testcontainers for integration tests

- **Status:** Accepted
- **Decision:** Provision Postgres + Redis per integration run via Testcontainers rather
  than reusing `docker-compose.dev.yml`. Required suites: tenant isolation, webhook
  signature/idempotency, run transitions.
- **Consequences:** Adds `testcontainers` + `@testcontainers/*` dev deps; slower but
  deterministic and isolated.

## ADR-009 — RLS policies read per-transaction GUC "claims"

- **Status:** Accepted
- **Context:** Auth-time lookups (API key by prefix, refresh token by hash, membership by
  user) and webhook tenant resolution happen before a tenant is known. A blanket
  `tenant_id = current_setting('app.current_tenant')` policy would make those paths
  impossible; disabling RLS on credential tables would remove the backstop.
- **Decision:** Every tenant-scoped table is FORCE RLS. Policies grant the standard
  tenant check plus, on credential/routing tables, a single-row "claim" lookup keyed by
  a GUC that `PrismaService.withRls` sets transaction-locally:
  `app.current_user` (Membership), `app.current_api_key_prefix` (ApiKey),
  `app.current_refresh_token_hash` and `app.current_user` (RefreshToken — hash claim for
  lookups, user claim so reuse detection can revoke the whole family),
  `app.current_integration_external_id` / `app.current_integration_id` (Integration).
  Unset GUCs read as NULL, so every policy fails closed.
- **Consequences:** Credential lookups must go through `withRls` with the matching
  claim; plain queries see nothing. `WITH CHECK` still requires the acting tenant, so a
  claim can never write across tenants. Dev Postgres (superuser) bypasses RLS —
  isolation tests must use `codebeast_app` (see `errors.md` E-002).

## ADR-012 — Signals carry semantic provider ids; deliveries key events

- **Status:** Accepted
- **Context:** The webhook pipeline overwrote `IssueSignal.externalId` with the
  delivery id (or payload hash) while the scan path stored the provider's semantic id
  (Jira key, Freshdesk ticket id). The two ingestion paths disagreed and could not
  dedupe the same item ingested both ways (found by the Phase 7 e2e).
- **Decision:** `WebhookEvent.externalId` keeps the delivery id (event replay dedupe);
  `IssueSignal.externalId` always carries the normalizer's semantic id. The unique
  `(tenantId, provider, externalId)` therefore dedupes one item across webhook and scan
  ingestion.
- **Consequences:** Repeat deliveries of the same semantic item do not increment
  `signalCount` (one signal per item per provider); delivery-level history lives on
  `WebhookEvent`.

## ADR-013 — SECURITY DEFINER helpers for cross-tenant maintenance

- **Status:** Accepted
- **Context:** `Run` and `WebhookEvent` force RLS. The stalled-run reaper and raw-payload
  janitor must see rows across tenants (and `WebhookEvent.tenantId` may be NULL), but
  `codebeast_app` cannot bypass RLS on ordinary queries.
- **Decision:** Ship two narrow `SECURITY DEFINER` Postgres functions owned by the
  migration role, with a fixed `search_path = public` and `EXECUTE` granted only to
  `codebeast_app`: `codebeast_stalled_runs` (read-only listing) and
  `codebeast_purge_raw_payloads` (nulls expired payloads in batches). All subsequent
  mutations still go through `PrismaService.withTenant`.
- **Consequences:** Maintenance code must call these helpers rather than inventing new
  RLS bypasses. Expanding them is a human-reviewed migration.

## ADR-014 — Redis-backed throttler storage

- **Status:** Accepted
- **Context:** In-memory Nest throttler limits reset per process and cannot share budget
  across API replicas. Login abuse and noisy webhooks need shared counters.
- **Decision:** Use a Redis Lua INCR/PEXPIRE storage behind `@nestjs/throttler`. Named
  throttlers: default (100/min), authEmail (5/min IP+email), authIp (20/min), webhook
  (per integration+provider, env-tunable). Under `NODE_ENV=test` storage falls back to
  the in-memory default so suites stay Redis-free.
- **Consequences:** Redis is required for correct rate limiting in every non-test
  environment. Readiness already probes Redis.

## ADR-015 — Audit logging is best-effort, not transactional

- **Status:** Accepted
- **Context:** Every mutating control-plane action and automation side-effect should be
  visible on the Activity page, but an audit write failure must never roll back a
  successful ship, login, or rule match.
- **Decision:** `@Audit` + `AuditInterceptor` record only decorated handlers after a
  successful response; `AuditService.record` / `recordSystem` catch and log failures.
  Bodies are redacted before storage. Automation events use `actorType: SYSTEM`.
- **Consequences:** Audit rows can lag or be missing under DB pressure; they are not a
  source of truth for authorization.
