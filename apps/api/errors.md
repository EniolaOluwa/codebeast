# apps/api — Known Issues, Gotchas & Postmortems

Living log of errors encountered while building/maintaining `apps/api`, with root cause
and fix. Add a new entry whenever something costs more than ~15 minutes to diagnose.

## Open

| ID    | Area               | Symptom                                                                                                                                               | Status                                                                                        |
| ----- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| E-001 | Migrations / agent | The coder agent rejects any patch touching `packages/db/prisma/migrations/**` (root `AGENTS.md` §5.1), yet the API requires schema changes.           | Workaround: migrations are human-authored/merged. Tracked in `decisions.md` ADR-002.          |
| E-002 | Testing / RLS      | Local Postgres user is a superuser, which bypasses RLS even with `FORCE ROW LEVEL SECURITY`. Isolation tests can pass falsely.                        | Mitigation: run isolation tests as `codebeast_app` (non-superuser). Phase 1 creates the role. |
| E-003 | Commit hook        | The commit-msg hook only accepts `^[a-zA-Z]+: .+` (e.g. `feat: ...`), which rejects the conventional `fix(scope): ...` form used in root `AGENTS.md`. | Follow repo hook: `topic: message`, no parentheses.                                           |
| E-004 | Prisma types       | After changing `packages/db/prisma/schema.prisma`, TypeScript types for new models are missing.                                                       | Run `pnpm db:generate` (generated client is gitignored).                                      |

## Resolved

| ID  | Date | Symptom        | Root cause | Fix |
| --- | ---- | -------------- | ---------- | --- |
| —   | —    | No entries yet | —          | —   |

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
