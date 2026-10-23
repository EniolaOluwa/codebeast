# CodeBeast

Autonomous SRE platform that turns customer support tickets and Sentry errors into validated pull requests.

This is the single source of truth for local setup — every command is copy-pasteable and
every step has a check.

> **AI agents:** jump to [Agent runbook](#agent-runbook) for a deterministic, non-interactive
> setup sequence.

## What you get

| Service       | URL                   | Notes                            |
| ------------- | --------------------- | -------------------------------- |
| Web (Next.js) | http://localhost:3000 | Landing page                     |
| API (NestJS)  | http://localhost:3001 | Swagger UI at `/api-docs`        |
| PostgreSQL    | localhost:5434        | Docker container, db `codebeast` |

## External dependencies

| Dependency       | Notes                                                                |
| ---------------- | -------------------------------------------------------------------- |
| Node.js ≥ 22     | `node --version`                                                     |
| pnpm 9.15.0      | via corepack — nothing to install globally                           |
| Docker runtime   | Linux: Docker Engine. macOS: **Colima** (Docker Desktop also works). |
| `docker-compose` | macOS: `brew install docker-compose` (scripts call `docker-compose`) |

### macOS: one-time setup

```bash
brew install colima docker docker-compose
colima start            # boots the Docker VM (~30–60s); verify: docker info
```

Colima does not auto-start after a reboot. If any docker command fails with
`failed to connect to the docker API at unix:///var/run/docker.sock`, run `colima start`
and retry. To auto-start at login: `brew services start colima`.

## Setup

```bash
# 1. Install dependencies
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm install

# 2. Environment files (once per clone)
cp apps/api/.env.example apps/api/.env
cp packages/db/.env.example packages/db/.env

# 3. Database: start postgres, generate the client, apply migrations
docker-compose -f docker-compose.dev.yml up -d
pnpm db:generate
pnpm db:migrate

# 4. Run api + web
pnpm dev
```

`pnpm dev:full` is the shortcut for step 3's container start plus step 4.

## Verify it works

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/            # 200
curl -s http://localhost:3001/health                                       # {"status":"ok",...}
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3001/api-docs    # 200
```

## Environment variables

`apps/api/.env` (from `apps/api/.env.example`) — `DATABASE_URL` is required; the rest have defaults.

| Variable                   | Default                           |
| -------------------------- | --------------------------------- |
| `DATABASE_URL`             | (required)                        |
| `PORT`                     | `3001`                            |
| `HOST`                     | `0.0.0.0`                         |
| `NODE_ENV`                 | `development`                     |
| `LOG_LEVEL`                | `info`                            |
| `CORS_ORIGIN`              | `*`                               |
| `JWT_SECRET`               | dev-only (required in production) |
| `ENCRYPTION_KEY`           | dev-only (required in production) |
| `AUTH_ACCESS_TTL_SECONDS`  | `900`                             |
| `AUTH_REFRESH_TTL_SECONDS` | `1209600`                         |
| `WEBHOOK_RAW_TTL_DAYS`     | `7`                               |
| `REDIS_URL`                | `redis://localhost:6379`          |

`packages/db/.env` (from `packages/db/.env.example`) holds `DATABASE_URL` for the Prisma CLI (`db:migrate`, `db:studio`).

## Common scripts

| Command                          | Description                                                 |
| -------------------------------- | ----------------------------------------------------------- |
| `pnpm dev`                       | Run api + web                                               |
| `pnpm dev:full`                  | Start postgres + api + web                                  |
| `pnpm dev:down`                  | Stop the postgres container                                 |
| `pnpm build`                     | Build all apps                                              |
| `pnpm lint`                      | Lint all apps                                               |
| `pnpm check-types`               | Type-check all apps                                         |
| `pnpm test`                      | Run all tests                                               |
| `pnpm db:generate`               | Generate the Prisma client                                  |
| `pnpm db:migrate`                | Apply migrations                                            |
| `pnpm db:studio`                 | Open Prisma Studio                                          |
| `pnpm --filter @repo/db db:seed` | Seed the demo tenant (`demo@codebeast.dev` / `password123`) |
| `pnpm format`                    | Format with Prettier                                        |

## Troubleshooting

| Symptom                                                              | Fix                                                                                                                                                                                    |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `failed to connect to the docker API at unix:///var/run/docker.sock` | Docker runtime not running. macOS: `colima start`, wait, retry `docker info`.                                                                                                          |
| `Bind for 0.0.0.0:5434 failed: port is already allocated`            | Another postgres (other project?) owns 5434. Find it: `docker ps --format '{{.Names}} {{.Ports}}'`. Stop it, or change the port in `docker-compose.dev.yml` **and** both `.env` files. |
| `EADDRINUSE` on 3000/3001, or Next says "Port 3000 is in use"        | Another dev server is running. Find it: `lsof -i :3000 -i :3001`.                                                                                                                      |
| API exits at startup with an env validation error                    | `apps/api/.env` is missing — run step 2 above.                                                                                                                                         |
| Install prints `.git can't be found`                                 | Harmless (husky running outside a git checkout, e.g., in Docker builds).                                                                                                               |

## Agent runbook

Deterministic, non-interactive. Stop at the first failing check and report the output.

1. **Preflight**
   - `node --version` → `v22` or higher.
   - `docker info --format '{{.ServerVersion}}'` → prints a version. If it fails on macOS:
     `colima start`, then poll `docker info` until it succeeds (up to ~90s).
2. **Install** — `corepack pnpm install --frozen-lockfile`
3. **Env files** (create only if missing; never overwrite):

   ```bash
   test -f apps/api/.env || cp apps/api/.env.example apps/api/.env
   test -f packages/db/.env || cp packages/db/.env.example packages/db/.env
   ```

4. **Database**
   - `docker-compose -f docker-compose.dev.yml up -d`
   - Poll until healthy (~15s):
     `docker ps --filter name=codebeast-postgres-1 --format '{{.Status}}'` contains `(healthy)`
   - `corepack pnpm db:generate`
   - `corepack pnpm --filter @repo/db db:deploy` (non-interactive migrations)
5. **Validate** — `corepack pnpm lint && corepack pnpm check-types && corepack pnpm test`
6. **Run** (long-running; do not use in automation) — `corepack pnpm dev`

### Guardrails

- Never commit `.env` files (they are gitignored).
- Do not modify `pnpm-lock.yaml`, `apps/*/Dockerfile`, or `docker-compose.yml` unless the task
  explicitly requires it. If dependencies change, run `corepack pnpm install` to regenerate
  the lockfile.
- Commit messages follow `topic: message` (e.g. `feat: add triage endpoint`) — enforced by the
  commit-msg hook.
- `AGENTS.md` contains the agent pipeline's operating spec (stage contracts, safety rules).

## Production deployment (Dokploy)

1. Create a Docker Compose service in Dokploy connected to this repo; compose path `./docker-compose.yml`.
2. Create a managed PostgreSQL database in Dokploy and set `DATABASE_URL` on the api service.
3. Set `CORS_ORIGIN` and `NEXT_PUBLIC_API_URL`; configure domains in the Dokploy Domains tab.

Database migrations are applied automatically when the api container starts
(`prisma migrate deploy`), so every deploy brings the schema up to date. If a migration
fails, the container exits instead of serving a mismatched schema.
