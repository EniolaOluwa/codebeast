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

## ADR-009 — One pipeline queue, stage transitions inside the runner

- **Status:** Accepted (supersedes the six-queue list in ADR-004)
- **Context:** The MVP has a single linear plan → code ⇄ validate → PR flow. Splitting
  it across six queues adds routing and partial-failure complexity before there is load.
- **Decision:** Use one BullMQ queue (`pipeline`) that runs `PipelineRunner`. The runner
  persists `Run.stage` between steps, and jobs are idempotent by `runId`.
- **Consequences:** Simple retry/backoff and one worker pool. If stages need independent
  scaling later, split them without changing the persisted state machine.

## ADR-010 — Manual GitHub REST client instead of `@octokit/auth-app`

- **Status:** Accepted (refines ADR-005)
- **Context:** The MVP needs App JWT → installation token → branch/commit/PR. Octokit
  adds dependencies for a small, well-documented REST surface.
- **Decision:** Implement the flow with `fetch` and `node:crypto` in
  `src/clients/github.client.ts`; sign RS256 App JWTs and cache installation tokens in
  memory until near expiry.
- **Consequences:** No new runtime dependency. The client must be revisited if GitHub
  changes the flow or if we need webhook/checks APIs.

## ADR-011 — `scrypt` password hashing, no native dependency

- **Status:** Accepted
- **Context:** Password auth needs a memory-hard KDF; `bcrypt`/`argon2` require native
  builds that complicate Docker and edge deploys.
- **Decision:** Use Node's `crypto.scrypt` with a random 16-byte salt and store
  `scrypt$N$r$p$salt$hash` (timing-safe compare).
- **Consequences:** No native modules. Parameters are embedded in each hash, so they can
  be upgraded without invalidating existing credentials.
