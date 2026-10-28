# apps/web — Architecture Decision Records (ADRs)

Append-only log of decisions that shape `apps/web`. Numbering continues from
`apps/api/decisions.md` (ADR-010+) so cross-references stay global. Status:
`Accepted`, `Superseded`, `Proposed`.

## ADR-010 — BFF-cookie auth for the console

- **Status:** Accepted
- **Context:** The API hands out bearer tokens (JWT access + rotating refresh).
  Browser storage of those tokens is XSS-sensitive and unusable from Next
  server components, which is the data-fetching convention for this app
  (root `AGENTS.md` §4).
- **Decision:** The console talks to Next.js route handlers under `/api/*`,
  which proxy to the control plane (`NEXT_PUBLIC_API_URL`) server-side. The
  BFF stores the API's refresh token in an `httpOnly`, `SameSite=Lax` cookie
  and keeps access tokens in memory only. Mutations require a same-origin
  `Origin` check (CSRF). The control-plane API stays bearer-only and does not
  grow a cookie mode.
- **Consequences:** Server components fetch via `lib/api.ts` (cookie-aware),
  never from client components directly. Refresh rotation lives in one place
  (`lib/session.ts`). A future mobile/CLI client keeps using the API directly.

## ADR-011 — Tailwind + design tokens per design.md

- **Status:** Accepted
- **Context:** `design.md` specifies a light/quiet visual system with tokens,
  and recommends Tailwind + shadcn/ui (§14). `apps/web` currently ships plain
  CSS.
- **Decision:** Publish `@repo/design-tokens` (tokens.css, Tailwind preset,
  tokens.json) from the monorepo; `apps/web` adopts Tailwind and copies
  shadcn-style components into `components/` (no runtime dependency on a
  component library). Both the dashboard and the marketing/landing pages
  share the tokens; marketing-only scales live in a preset extension.
- **Consequences:** No hex values in app code — always tokens. Components stay
  in-app until a second consumer exists (then extract `@repo/ui`).
