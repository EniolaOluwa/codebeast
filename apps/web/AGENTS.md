# apps/web — Repository Context Layer (RCL)

> Per-repo context for the agent pipeline (root `AGENTS.md` §9). Keep under 2,000 tokens.

## 1. What this service is

Next.js App Router control plane UI for CodeBeast. Server components fetch the Nest
API; mutations go through server actions. There is no browser-side session store.

- App Router: `app/(auth)/*`, `app/(dashboard)/*`
- Shell: `components/shell/*` (sidebar nav includes Overview, Reports, Sources, Rules,
  Activity, Settings)
- Data: `lib/api.ts` (BFF cookie bearer) + `lib/api-types.ts`
- Design tokens: `@repo/design-tokens`

## 2. Non-obvious decisions

- **BFF cookies (ADR-010).** Access + refresh tokens live in httpOnly cookies set by
  server actions. Client components never call `fetch('/api/...')` or read tokens.
- **Server components by default.** Add `'use client'` only for forms, toggles, and
  interactive widgets.
- **No `useEffect` data fetching.** Lists and detail pages load via `apiFetch` in the
  server component; filters use URL search params.
- **Plain-language copy.** Prefer "reports", "sources", "Activity" over internal names
  except on the audit log itself.

## 3. Landmines

- `API_URL` / `NEXT_PUBLIC_API_URL` must point at the control plane (`apps/api`).
- Middleware refreshes expired access tokens; a 401 from `apiFetch` should redirect to
  `/login?expired=1` (see dashboard layout).
- Activity page requires the caller's JWT/API key to carry `audit:read`.

## 4. Test conventions

- Unit: `src/__tests__/**` with vitest + Testing Library.
- Prefer testing pure helpers (`lib/status`, `lib/rules`) over full page renders.
