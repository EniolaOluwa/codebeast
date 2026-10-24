# apps/api — Known Issues, Gotchas & Postmortems

Living log of errors encountered while building/maintaining `apps/api`, with root cause
and fix. Add a new entry whenever something costs more than ~15 minutes to diagnose.

## Open

| ID    | Area               | Symptom                                                                                                                                                    | Status                                                                                                                                                                                                                                                                                                                 |
| ----- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-001 | Migrations / agent | The coder agent rejects any patch touching `packages/db/prisma/migrations/**` (root `AGENTS.md` §5.1), yet the API requires schema changes.                | Workaround: migrations are human-authored/merged. Tracked in `decisions.md` ADR-002.                                                                                                                                                                                                                                   |
| E-002 | Testing / RLS      | Local Postgres user is a superuser, which bypasses RLS even with `FORCE ROW LEVEL SECURITY`. Isolation tests can pass falsely.                             | Partially resolved: `20261019221500_app_role` adds `codebeast_app` + grants, and `test:integration` proves isolation as that role. The dev `apps/api/.env` still connects as `postgres`; switching it requires auth-bootstrap RLS policies (login/register read `Membership`/`RefreshToken` before a tenant is known). |
| E-003 | Commit hook        | The commit-msg hook only accepts `^[a-zA-Z]+: .+` (e.g. `feat: ...`), which rejects the conventional `fix(scope): ...` form used in root `AGENTS.md`.      | Follow repo hook: `topic: message`, no parentheses.                                                                                                                                                                                                                                                                    |
| E-004 | Prisma types       | After changing `packages/db/prisma/schema.prisma`, TypeScript types for new models are missing.                                                            | Run `pnpm db:generate` (generated client is gitignored).                                                                                                                                                                                                                                                               |
| E-005 | Lint               | `eslint-plugin-n` flags `fetch`/`async_hooks` as experimental because it assumes Node 16, though the repo requires Node >=22.                              | Disabled `n/no-unsupported-features/node-builtins` in `apps/api/eslint.config.ts`.                                                                                                                                                                                                                                     |
| E-006 | Env                | The API needs `JWT_SECRET`, `ENCRYPTION_KEY`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`; missing values fail env validation on boot.                             | Dev defaults exist in `env.schema.ts`; production must set all four.                                                                                                                                                                                                                                                   |
| E-008 | Swagger / Zod      | `npm run start` hangs at "Scanning OpenAPI document" with no CPU usage; the `/v1/api-keys` module never initializes.                                       | `z.coerce.date()` in a `createZodDto` schema makes the Swagger scanner loop. Use `z.iso.datetime()` (or a string) in DTOs.                                                                                                                                                                                             |
| E-009 | Fastify / startup  | Adding a custom `application/json` content-type parser before `app.init()` throws `FST_ERR_CTP_ALREADY_PRESENT` (Nest re-registers it) and the boot hangs. | Use `NestFactory.create(..., { rawBody: true })` and read `request.rawBody`; do not override Nest's parsers.                                                                                                                                                                                                           |

## Resolved

| ID    | Date       | Symptom                                                                                | Root cause                                                                                                                      | Fix                                                                                        |
| ----- | ---------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| E-007 | 2026-10-19 | API keys generated with a `base64url` secret intermittently failed auth (scope/authn). | `base64url` can emit `_`, so `cb_live_<prefix>_<secret>` no longer split into four parts and prefix extraction returned `null`. | Generate the secret as hex and parse the prefix with an anchored regex.                    |
| E-008 | 2026-10-19 | API boot hung at the OpenAPI scan step.                                                | `z.coerce.date()` in `CreateApiKeySchema` caused unbounded schema traversal in `@nestjs/swagger`.                               | Use `z.iso.datetime()` in DTOs; add `src/__tests__/openapi.test.ts` as a regression guard. |
| E-009 | 2026-10-19 | API boot hung after registering Fastify plugins / content-type parsers.                | Nest's init re-adds JSON/urlencoded parsers; our pre-init parser raised `FST_ERR_CTP_ALREADY_PRESENT`.                          | Create the app with `rawBody: true`; keep webhook handlers reading `request.rawBody`.      |

## Template

```
### E-XXX — <short title>

- Date:
- Area:
- Symptom:
- Root cause:
- Fix / workaround:
- Prevention:
```
