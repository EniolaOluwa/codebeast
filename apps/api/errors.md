# apps/api — Known Issues, Gotchas & Postmortems

Living log of errors encountered while building/maintaining `apps/api`, with root cause
and fix. Add a new entry whenever something costs more than ~15 minutes to diagnose.

## Open

| ID    | Area               | Symptom                                                                                                                                               | Status                                                                                                              |
| ----- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| E-001 | Migrations / agent | The coder agent rejects any patch touching `packages/db/prisma/migrations/**` (root `AGENTS.md` §5.1), yet the API requires schema changes.           | Workaround: migrations are human-authored/merged. Tracked in `decisions.md` ADR-002.                                |
| E-002 | Testing / RLS      | Local Postgres user is a superuser, which bypasses RLS even with `FORCE ROW LEVEL SECURITY`. Isolation tests can pass falsely.                        | Mitigated: `codebeast_app` role ships in the Phase 1 migration; Testcontainers harness runs isolation suites as it. |
| E-003 | Commit hook        | The commit-msg hook only accepts `^[a-zA-Z]+: .+` (e.g. `feat: ...`), which rejects the conventional `fix(scope): ...` form used in root `AGENTS.md`. | Follow repo hook: `topic: message`, no parentheses.                                                                 |
| E-004 | Prisma types       | After changing `packages/db/prisma/schema.prisma`, TypeScript types for new models are missing.                                                       | Run `pnpm db:generate` (generated client is gitignored).                                                            |

## Resolved

| ID    | Date       | Symptom                                                                                                            | Root cause                                                                                                                                                             | Fix                                                                                                                                                                                     |
| ----- | ---------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-005 | 2026-10-23 | Testcontainers: `Could not find a working container runtime strategy` on macOS, while `docker` commands work.      | Colima/Docker Desktop expose the socket via the docker CLI context; `DOCKER_HOST` is unset and `/var/run/docker.sock` does not exist.                                  | `test/support/docker.ts` derives `DOCKER_HOST` from `docker context inspect` and sets `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock` before containers start.             |
| E-006 | 2026-10-23 | Replayed webhooks returned 500 (`DriverAdapterError`) instead of the duplicate path.                               | Catching a unique-constraint violation (P2002) inside an interactive Prisma transaction leaves the Postgres transaction aborted (25P02); even the recovery read fails. | Use `createMany({ skipDuplicates: true })` (INSERT … ON CONFLICT DO NOTHING) for idempotent writes, then read the row back by its unique key — never create+catch inside a transaction. |
| E-007 | 2026-10-23 | Refresh-token family revocation failed with `new row violates row-level security policy for table "RefreshToken"`. | Postgres evaluates `WITH CHECK` on UPDATE too; the revocation ran under the user claim with no tenant claim, so updated rows failed the check.                         | Set **tenant + user** claims for writes (`withRls({TENANT, USER})`); credential-only claims are for reads. Regression test in `tenant-isolation.test.ts`.                               |

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
