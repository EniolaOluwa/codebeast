# apps/api — Build Progress

Tracking doc for the control-plane MVP. Status legend: `[ ]` todo, `[~]` in progress,
`[x]` done, `[!]` blocked.

## Snapshot

- **Branch:** `feat/api-develop`
- **Milestone:** Control-plane MVP
- **Updated:** 2026-10-28
- **Baseline green:** `pnpm --filter @repo/api lint && test` (unit); apply `20261028140000_audit_hardening` before integration

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
| 6   | Console (design.md) | `[x]`  | `@repo/design-tokens`, Tailwind, landing redesign, shell, Overview/Reports/Report detail, Sources, Settings, BFF auth                                   |
| 7   | Sources             | `[x]`  | Discord + Freshdesk ingestion                                                                                                                           |
| 8   | Rules               | `[x]`  | detection + automation engine, dry-run, PR limits, auto-approve                                                                                         |
| 9   | Hardening           | `[x]`  | audit logs → Activity, readiness (db+redis), metrics, rate limits, stalled-run reaper, raw-payload janitor                                              |

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

- [x] `@repo/design-tokens` (tokens.css, Tailwind v4 theme mapping, tokens.json)
- [x] Tailwind v4 + in-app UI primitives (button/badge/card/input/tabs); dark theme tokens + toggle
- [x] landing page redesign (design.md §15: 56–72px hero, token-driven, pipeline graphic, one dark primary per section)
- [x] app shell (240px sidebar, mobile nav, page-header/empty-state/error-banner patterns)
- [x] Overview — real `GET /v1/overview` (stat cards, needs-review list, source health)
- [x] Reports list — real `GET /v1/issues` (status filter, provider chips, ticket links, pagination)
- [x] Report detail — signature view (evidence + Jira/GitHub tabs, run card, ship/retry/ignore/approve actions)
- [x] Sources — connected cards + Scan now + connect form; Discord/Freshdesk "Coming soon"
- [x] Settings — workspace, members (invite/roles/remove), API keys (create shown once, revoke)
- [x] BFF-cookie auth (ADR-010): httpOnly cookies, server-action mutations, middleware refresh-on-expiry
- [ ] Deferred to console polish: Playwright smoke, command palette, J/K shortcuts, bulk actions, side sheet, PR column in the Reports table

## Phase 7 — Sources

- [x] `DISCORD` + `FRESHDESK` providers in the wire contract and Prisma enum (parity-tested)
- [x] Discord: REST scan client (bot token, channel list), bot-message filtering, scan bookkeeping
- [x] Freshdesk: signed webhook (`/v1/webhooks/freshdesk/:integrationId`, shared secret) + REST scan client (domain + API key)
- [x] Shared `SourceScanner` registry + `ScanRunner` (Jira/Discord/Freshdesk); `requestScan` accepts every scannable source
- [x] Normalizers: Discord messages and Freshdesk conversations (cross-provider references extracted, like Slack)
- [x] Console: connect forms for both sources, Scan now for all scannable sources, Coming-soon row removed
- [x] e2e: signed Freshdesk webhook (+replay/bad-secret), Discord scan (+bot skip/dedupe), Freshdesk scan, cross-provider correlation, unscannable rejection
- [x] ADR-012: signals carry semantic provider ids; deliveries key events

## Phase 8 — Rules

- [x] `Rule` model + `RuleKind` enum (RLS/grants migration; parity-tested)
- [x] Wire contracts: conditions (providers / min signals / title) + kind-specific actions with the PR safety refinement (repository + confidence floor + daily limit are mandatory to validate an openPr rule)
- [x] `RuleEngine`: ordered evaluation (oldest first, first match wins), detection default = DETECT, dry-run over the last 7 days
- [x] Detection hooks: webhook pipeline + `SignalIngestService` gate brand-new reports (IGNORE records the report and skips compute); triage only computes NEW/TRIAGED reports
- [x] Automation hooks: runs reaching READY evaluate automation rules — ticket and/or PR via the existing queues, rule repository applied to the report, confidence floor and tenant-wide daily PR limit enforced
- [x] `rules:read`/`rules:write` scopes; CRUD + dry-run endpoints
- [x] Console: Rules page per design.md §8.5 (detection/automation sections, plain-language sentences, enable/disable, dry run, delete, create forms with the PR confirmation checkbox); nav unhidden
- [x] e2e: CRUD + PR-rail validation, ignore gating, auto-ship, daily-limit skip, dry-run counts

## Phase 9 — Hardening

- [x] audit log interceptor + `GET /v1/audit-logs` → Activity page
- [x] extended readiness (db + redis)
- [x] metrics + webhook/login rate limits (Prometheus + Redis throttler)
- [x] stalled-run reaper + raw-payload janitor (`maintenance` queue + DEFINER helpers)
- [x] per-repo RCL + Swagger polish

## Phase 10 — Agent service

- [x] `@repo/types` agent-service wire contracts (`RepositoryCheckout`, plan/code/validate requests)
- [x] `apps/agent` Fastify worker: planner → coder → Docker validator
- [x] Provider-agnostic `LLM_*` env (OpenAI-compatible chat client)
- [x] `HttpAgentClient` + `AGENT_CLIENT_MODE=stub|http` + GitHub installation checkout tokens
- [x] Dev compose profile `agent` (Docker socket + workspace volume)

## Next action

Phase 9 complete. Run the real agent locally via
`docker-compose -f docker-compose.dev.yml --profile agent up -d agent` with
`AGENT_CLIENT_MODE=http`, or pick console polish deferred from Phase 6
(Playwright smoke, command palette, bulk actions).
