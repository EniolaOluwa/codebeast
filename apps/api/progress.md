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

| #   | Phase               | Status | Acceptance criteria                                                                                                                                     |
| --- | ------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Contracts           | `[x]`  | Zod schemas + enums/state machine in `@repo/types`; imported by api                                                                                     |
| 1   | Data foundation     | `[x]`  | Schema + migration + RLS + `codebeast_app` role + seed; `withTenant`, `CryptoService`, config; cross-tenant read returns empty                          |
| 2   | Identity & access   | `[x]`  | register/login/refresh/logout/me, API keys, members, guards; scope rejection tests pass                                                                 |
| 3   | Ingestion           | `[x]`  | repo/integration CRUD; Slack/Sentry/GitHub/Jira webhooks with signature verify + idempotency; duplicate webhook produces one event; bad signature → 401 |
| 4   | Orchestration       | `[x]`  | BullMQ queues; run state machine; `AgentClient` (stubbed); retry/backoff/escalation per root §6.4                                                       |
| 5   | Delivery            | `[x]`  | runs read API; GitHub client + `PullRequest`; compute/ship split (`READY`); PR status sync; issue retry/ignore/approve                                  |
| 5.5 | Jira bidirectional  | `[x]`  | Ticket model + Jira create; Jira scan (JQL) via shared ingest service; `GET /v1/overview`                                                               |
| 6   | Console (design.md) | `[ ]`  | `@repo/design-tokens`, Tailwind/shadcn, landing redesign, shell, Reports list/detail, Sources, Settings, BFF auth                                       |
| 7   | Sources             | `[ ]`  | Discord + Freshdesk ingestion                                                                                                                           |
| 8   | Rules               | `[ ]`  | detection + automation engine, dry-run, PR limits, auto-approve                                                                                         |
| 9   | Hardening           | `[ ]`  | audit logs → Activity, readiness (db+redis), metrics, rate limits, stalled-run reaper, raw-payload janitor                                              |

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

- [x] Redis in dev compose + BullMQ behind `QUEUE_PUBLISHER` (explicit ioredis client; job retries with exponential backoff; id-based dedupe)
- [x] Run state machine (`run-state-machine.ts`) — pure; 3 attempts / 1 replan / escalate (root §6.4); self-loop retries
- [x] `AgentClient` interface + deterministic `StubAgentClient`
- [x] `RunOrchestrator` — idempotent stage handlers (ingest/triage/plan/code/validate/pr) with attempt + replan accounting
- [x] `WorkersService` — one worker per queue (disabled under test); job ids `run-<id>-<stage>-<attempt>`
- [x] Coalescing: one delayed triage job per issue per window (`INGEST_COALESCE_MS`, default 30s)
- [x] Plan/Patch/FileChange/ValidationRun persistence on each stage
- [x] Live smoke: signed webhook → workers → run SUCCEEDED → issue PR_OPENED

## Phase 5 — Delivery

- [x] runs read API (`GET /v1/runs`, `GET /v1/runs/:id` with plan/patch/validation/PR chain)
- [x] compute/ship split: run ends `SUCCEEDED` after validation; issue → `READY`; writes happen only via ship actions
- [x] `GitHubClient` seam — `StubGitHubClient` (default) + `OctokitGitHubClient` (`@octokit/auth-app`, env-gated) + `PullRequest` rows
- [x] ship action `POST /v1/issues/:id/pr` (via the `pr` queue, idempotent per run, branch `codebeast/fix-<run>`)
- [x] PR status sync from inbound GitHub webhooks (`pull_request.closed` → MERGED/CLOSED, reopened → OPEN; never ingested as signals)
- [x] issue actions: retry (fresh run) / ignore (cancels open run) / approve (PR_OPENED → RESOLVED)
- [x] e2e: run → READY → ship → PR row → sync; actions matrix; runs read API

## Phase 5.5 — Jira bidirectional

- [x] `Ticket` model (+ `TICKETED` issue status) with RLS/grants migration
- [x] `JiraClient` seam: `StubJiraClient` (default) + `JiraApiClient` (REST v3, ADF descriptions, env-gated by `JIRA_CLIENT_MODE=api`)
- [x] Destination: `POST /v1/issues/:id/ticket` via the `ticket` queue; evidence-bearing description; idempotent per issue
- [x] Source: `POST /v1/integrations/:id/scan` via the `scan` queue → JQL scan → `SignalIngestService` (shared with future Discord/Freshdesk pollers)
- [x] `GET /v1/overview` — 7-day counts, needs-review list, source health (`overview:read` scope)
- [x] e2e: ticket idempotency, ticket+PR both recorded, scan import + replay dedupe, overview before/after shipping

## Phase 6 — Console (design.md)

- [ ] `@repo/design-tokens` (tokens.css, Tailwind preset, tokens.json)
- [ ] Tailwind + shadcn-style components; dark theme tokens + toggle
- [ ] landing page redesign (design.md §15)
- [ ] app shell (sidebar 240px → icon rail → drawer; page header pattern)
- [ ] Reports list (real `GET /v1/issues`; filters, badges, source chips)
- [ ] Report detail — signature view (evidence + Jira/PR tabs + actions)
- [ ] Sources (Discord/Freshdesk "Coming soon"; Scan now) + Settings
- [ ] BFF-cookie auth (ADR-010) + Playwright smoke

## Phase 7 — Sources

- [ ] Discord ingestion (bot invite flow, channel scope)
- [ ] Freshdesk ingestion (domain + API key, group/priority scope)

## Phase 8 — Rules

- [ ] detection rules (what becomes a report) + dry-run
- [ ] automation rules (ticket/PR creation, confidence floor, daily PR limit, auto-approve)
- [ ] Rules page per design.md §8.5

## Phase 9 — Hardening

- [ ] audit log interceptor + `GET /v1/audit-logs` → Activity page
- [ ] extended readiness (db + redis)
- [ ] metrics + webhook/login rate limits
- [ ] stalled-run reaper + raw-payload janitor
- [ ] per-repo RCL + Swagger polish

## Next action

Start **Phase 6**: Console per design.md — `@repo/design-tokens`, Tailwind/shadcn, landing redesign, app shell, Reports list/detail, Sources, Settings, BFF auth (ADR-010).
