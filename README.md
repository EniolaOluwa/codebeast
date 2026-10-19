# CodeBeast

Autonomous SRE platform that turns customer support tickets and Sentry errors into validated pull requests.

CodeBeast ingests Sentry errors and support tickets, correlates them into a single triaged issue, traces the root cause, writes the smallest correct fix, validates it (tests, lint, type-check) in an isolated sandbox, and opens a reviewable pull request for a human to approve.

`AGENTS.md` documents the agent pipeline's operating spec: planner → coder → validator stage contracts, safety constraints, and commit conventions.

## Stack

| Layer      | Technology                        |
| ---------- | --------------------------------- |
| Monorepo   | pnpm workspaces + Turborepo       |
| Web        | Next.js 15 (App Router), React 19 |
| API        | Fastify v5, TypeScript, ESM       |
| ORM        | Prisma (PostgreSQL)               |
| Validation | TypeBox                           |
| Testing    | Vitest                            |
| Linting    | ESLint 9 (flat config), Prettier  |
| CI         | GitHub Actions                    |
| Deployment | Docker + Dokploy (docker-compose) |

## Prerequisites

- Node.js >= 22.0.0
- pnpm (via corepack)
- Docker & Docker Compose

## Getting Started

```bash
# Enable corepack (one-time)
corepack enable
corepack prepare pnpm@9.15.0 --activate

# Clone and install
git clone <repo-url>
cd codebeast
pnpm install
cp apps/api/.env.example apps/api/.env

# Start postgres + api + web
pnpm dev:full
```

**Services:**

- Frontend: http://localhost:3000
- API: http://localhost:3001
- Swagger docs: http://localhost:3001/api-docs
- PostgreSQL: localhost:5434 (database `codebeast`)

## Project Structure

```text
codebeast/
├── apps/
│   ├── api/                    # Fastify backend
│   │   ├── src/
│   │   │   ├── config/         # Env validation (@fastify/env)
│   │   │   ├── plugins/        # Fastify plugins (cors, helmet, swagger, etc.)
│   │   │   ├── modules/        # Route modules (health, etc.)
│   │   │   └── shared/         # Error classes, utilities
│   │   └── Dockerfile
│   └── web/                    # Next.js frontend
│       ├── app/                # App Router pages
│       └── Dockerfile
├── packages/
│   ├── typescript-config/      # Shared tsconfig presets (base, nextjs, node)
│   ├── types/                  # Shared TypeScript types
│   ├── db/                     # Prisma schema + client
│   └── eslint-config/          # Shared ESLint configs
├── AGENTS.md                   # Agent pipeline operating spec
├── docker-compose.yml          # Dokploy production (api + web)
├── docker-compose.dev.yml      # Local dev (postgres only)
└── turbo.json                  # Task pipeline
```

## Scripts

| Command              | Description                              |
| -------------------- | ---------------------------------------- |
| `pnpm dev`           | Run all apps via Turborepo               |
| `pnpm dev:full`      | Start postgres + all apps in one command |
| `pnpm dev:down`      | Stop postgres container                  |
| `pnpm build`         | Build all apps                           |
| `pnpm lint`          | Lint all apps                            |
| `pnpm test`          | Run all tests                            |
| `pnpm test:coverage` | Run tests with coverage report           |
| `pnpm check-types`   | Type-check all apps                      |
| `pnpm format`        | Format with Prettier                     |
| `pnpm db:generate`   | Generate Prisma client                   |
| `pnpm db:migrate`    | Run database migrations                  |
| `pnpm db:studio`     | Open Prisma Studio                       |

## Environment Variables

Copy `.env.example` to `.env` in `apps/api/`:

```bash
cp apps/api/.env.example apps/api/.env
```

| Variable       | Description                  | Default       |
| -------------- | ---------------------------- | ------------- |
| `DATABASE_URL` | PostgreSQL connection string | (required)    |
| `PORT`         | API server port              | `3001`        |
| `HOST`         | API server host              | `0.0.0.0`     |
| `NODE_ENV`     | Environment                  | `development` |
| `LOG_LEVEL`    | Pino log level               | `info`        |
| `CORS_ORIGIN`  | Allowed CORS origins         | `*`           |

## Deployment (Dokploy)

1. Create a Docker Compose service in Dokploy and connect this repository.
2. Set the compose path to `./docker-compose.yml`.
3. Create a managed PostgreSQL database in Dokploy and set `DATABASE_URL` for the api service.
4. Set `CORS_ORIGIN` and `NEXT_PUBLIC_API_URL`.
5. Configure domains in the Dokploy Domains tab and deploy.

## Commit Convention

Commits follow the `topic: message` format (enforced by the commit-msg hook), e.g.:

```
feat: add issue triage endpoint
fix: resolve Sentry correlation bug
```
