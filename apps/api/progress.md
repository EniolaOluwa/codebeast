# apps/api — Build Progress

Tracking doc for the control-plane MVP. Status legend: `[ ]` todo, `[~]` in progress,
`[x]` done, `[!]` blocked.

## Snapshot

- **Branch:** `feat/api-control-plane`
- **Milestone:** Control-plane MVP
- **Updated:** 2026-10-19
- **Baseline green:** `pnpm --filter @repo/api lint && check-types && test` (58 tests)
- **Runtime smoke:** boot on `:3001`, `/health`, login, repo list, API key create, and
  signed-webhook idempotency verified against local Postgres + Redis.

## Locked decisions

JWT + hashed API keys · BullMQ + Redis · additive Prisma schema + RLS · GitHub App
(installation tokens) · Slack ingestion first · wire contracts stay in `@repo/types`
(converted to Zod) · Testcontainers for integration tests. See `decisions.md`.

## Phases

| #   | Phase             | Status | Notes                                                                                                                |
| --- | ----------------- | ------ | -------------------------------------------------------------------------------------------------------------------- |
| 0   | Contracts         | `[x]`  | Zod schemas/enums + `MAX_ATTEMPTS` in `@repo/types`; api imports them                                                |
| 1   | Data foundation   | `[x]`  | Schema/migrations/RLS/seed + `withTenant`/crypto/config; `codebeast_app` role added (dev URL still admin, see E-002) |
| 2   | Identity & access | `[x]`  | register/login/refresh/logout/me, API keys, members, guard; unit tests pass                                          |
| 3   | Ingestion         | `[x]`  | repo/integration CRUD; four webhooks; signature verify + idempotency; triage                                         |
| 4   | Orchestration     | `[x]`  | BullMQ queue + runner; run state machine; `AgentClient` HTTP; retries/escalation                                     |
| 5   | Delivery          | `[x]`  | patch/validation persistence, GitHub App PR creation, issue retry/ignore/approve                                     |
| 6   | Hardening         | `[~]`  | audit list, RLS integration harness, OpenAPI regression; readiness/metrics/rate limits pending                       |

## Phase 0 — Contracts

- [x] `errorEnvelope`, `paginatedResponse`, `webhookEnvelope` schemas
- [x] `issueContext`, `planBlueprint`, `patchSubmission`, `validationResult`
- [x] run/issue/integration enums + run state machine
- [x] Convert `@repo/types` to a buildable Zod package at `dist/`

## Phase 1 — Data foundation

- [x] Prisma models: Tenant, User, Membership, ApiKey, RefreshToken, Repository,
      Integration, GitHubInstallation, SlackWorkspace, WebhookEvent, Issue, IssueSignal,
      Run, Plan, Patch, FileChange, ValidationRun, PullRequest, AuditLog
- [x] Additive migrations `20261019213715_control_plane`, `20261019214200_rls`,
      `20261019221500_app_role`
- [x] `codebeast_app` non-superuser role + grants (runtime URL still admin, see E-002)
- [x] Tenant context (AsyncLocalStorage + `withTenant`/`withTenantId`)
- [x] `CryptoService` (AES-256-GCM) + env/config additions
- [x] Seed tenant `demo` / user `demo@codebeast.app` / password `password123`

## Phase 2 — Identity & access

- [x] auth module (register/login/refresh/logout/me)
- [x] api-keys module (prefix + sha256 hash, scopes)
- [x] members module (roles)
- [x] `AuthGuard` with `@Public`, `@Roles`, `@Scopes` (JWT + API key)

## Phase 3 — Ingestion

- [x] repositories + integrations CRUD
- [x] webhook controllers (Slack/Sentry/GitHub/Jira) + signature verification
- [x] `WebhookEvent` idempotency (unique provider + delivery id)
- [x] triage/correlation service + auto-start run when issue has a repository

## Phase 4 — Orchestration

- [x] Redis/BullMQ queue module + noop fallback for tests (`QUEUE_ENABLED=false`)
- [x] `Run` state machine + attempt accounting (max 3, one replan)
- [x] `AgentClient` HTTP client (`/plan`, `/code`, `/validate`) + `GithubClient`
- [x] pipeline runner with escalation on low confidence/exhaustion/agent failure

## Phase 5 — Delivery

- [x] Patch/FileChange/ValidationRun persistence
- [x] GitHub App token exchange + PR creation (manual REST, no octokit)
- [x] issue actions: retry / ignore / approve
- [!] Requires `GITHUB_APP_ID` + `GITHUB_APP_PRIVATE_KEY`; otherwise run escalates

## Phase 6 — Hardening

- [x] audit list endpoint `GET /v1/audit-logs`
- [ ] readiness (db + redis)
- [ ] metrics + webhook/login rate limits
- [x] Swagger typed responses for every endpoint + response-schema regression test
- [x] OpenAPI scan regression test (`src/__tests__/openapi.test.ts`)
- [x] Testcontainers harness for tenant isolation (`test:integration`, `codebeast_app`)
- [ ] Integration coverage for webhook idempotency + run transitions

## Next action

1. Design auth-bootstrap RLS policies (or a narrow privileged path) so the runtime can
   connect as `codebeast_app`; then switch `apps/api/.env`.
2. Add integration coverage for webhook idempotency + run transitions.
3. Extended readiness (db + redis), metrics, and rate limits.
