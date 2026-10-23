# apps/api — Build Progress

Tracking doc for the control-plane MVP. Status legend: `[ ]` todo, `[~]` in progress,
`[x]` done, `[!]` blocked.

## Snapshot

- **Branch:** `feat/api-develop`
- **Milestone:** Control-plane MVP
- **Updated:** 2026-10-23
- **Baseline green:** `pnpm --filter @repo/api lint && check-types && test`

## Locked decisions

JWT + hashed API keys · BullMQ + Redis · additive Prisma schema + RLS · GitHub App
(installation tokens) · Slack ingestion first · wire contracts stay in `@repo/types`
(converted to Zod) · Testcontainers for integration tests. See `decisions.md`.

## Phases

| #   | Phase             | Status | Acceptance criteria                                                                                                                                     |
| --- | ----------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Contracts         | `[x]`  | Zod schemas + enums/state machine in `@repo/types`; imported by api                                                                                     |
| 1   | Data foundation   | `[x]`  | Schema + migration + RLS + `codebeast_app` role + seed; `withTenant`, `CryptoService`, config; cross-tenant read returns empty                          |
| 2   | Identity & access | `[x]`  | register/login/refresh/logout/me, API keys, members, guards; scope rejection tests pass                                                                 |
| 3   | Ingestion         | `[x]`  | repo/integration CRUD; Slack/Sentry/GitHub/Jira webhooks with signature verify + idempotency; duplicate webhook produces one event; bad signature → 401 |
| 4   | Orchestration     | `[ ]`  | BullMQ queues; run state machine; `AgentClient` (stubbed); retry/backoff/escalation per root §6.4                                                       |
| 5   | Delivery          | `[ ]`  | patch/validation persistence; GitHub App PR creation; issue retry/ignore/approve                                                                        |
| 6   | Hardening         | `[ ]`  | audit logs; readiness (db+redis); metrics; rate limits; Swagger; RCL refresh                                                                            |

## Phase 0 — Contracts

- [x] `errorEnvelope`, `paginatedResponse` schemas
- [x] `issueContext`, `planBlueprint`, `patchSubmission`, `validationResult`
- [x] `runStatus` + run/issue/integration enums
- [x] Convert `@repo/types` interfaces to Zod; keep package name
- [x] Build output (`dist/`) + vitest suite for `@repo/types`

## Phase 1 — Data foundation

- [x] Prisma models: Tenant, Membership, ApiKey, RefreshToken, Repository,
      Integration, GitHubInstallation, SlackWorkspace, WebhookEvent, Issue,
      IssueSignal, Run, Plan, Patch, FileChange, ValidationRun, PullRequest, AuditLog
- [x] Additive migration + RLS policies + `codebeast_app` role (ADR-009 claims)
- [x] `TenantContext` (AsyncLocalStorage) + `PrismaService.withTenant`/`withRls`
- [x] `CryptoService` (AES-256-GCM) + config/env additions
- [x] Extend `env.schema.ts` and `.env.example`
- [x] Seed (`packages/db/prisma/seed.ts`, demo@codebeast.dev / password123)
- [x] Testcontainers harness + tenant-isolation integration suite (as `codebeast_app`)

## Phase 2 — Identity & access

- [x] auth module (register/login/refresh/logout/me) — shortcut in `common/auth/jwt.ts` (HS256, no new deps)
- [x] api-keys module (prefix + sha256 hash, scopes, revoke)
- [x] members module (roles, last-owner protection)
- [x] `AuthGuard` (JWT ∪ API key), `@Public`/`@Roles`/`@Scopes`, `@CurrentPrincipal`
- [x] Ambient tenant context via `TenantContextInterceptor` (AuthGuard always resolves a tenant — no separate TenantGuard needed)
- [x] `/v1` route prefix via `RouterModule` (health stays at `/`)
- [x] e2e: refresh rotation + reuse detection, scope rejection (403), revocation (401)

## Phase 3 — Ingestion

- [x] repositories + integrations CRUD (secrets AES-256-GCM at rest, never returned)
- [x] webhook controllers (Slack/Sentry/GitHub/Jira) + signature verification (raw-body parser)
- [x] `WebhookEvent` idempotency (`createMany skipDuplicates`) + `ingest` enqueue via `QueuePublisher` seam
- [x] triage/correlation service — signals → one issue, 24h window, cross-provider references
- [x] lazy enrichment + cached `issueContext` (`GET /v1/issues/:id/context`; enrichment once per snapshot)
- [x] raw payload truncation (64 KB) + TTL bookkeeping (janitor lands in Phase 6)
- [x] issues read API (`GET /v1/issues`, `GET /v1/issues/:id`)

## Phase 4 — Orchestration

- [ ] Redis/BullMQ module + queues (ingest/triage/plan/code/validate/pr)
- [ ] `Run` state machine + attempt accounting
- [ ] `AgentClient` interface + stub
- [ ] workers with retry/backoff/escalation

## Phase 5 — Delivery

- [ ] Patch/FileChange/ValidationRun persistence
- [ ] GitHub App token exchange + PR creation (`@octokit/auth-app`)
- [ ] issue actions: retry / ignore / approve

## Phase 6 — Hardening

- [ ] audit log interceptor + `GET /v1/audit-logs`
- [ ] extended readiness (db + redis)
- [ ] metrics + webhook/login rate limits
- [ ] per-repo RCL + Swagger polish

## Next action

Start **Phase 4**: orchestration (BullMQ on Redis behind `QUEUE_PUBLISHER`, run state machine, `AgentClient` stub, workers with retry/backoff/escalation).
