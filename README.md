# MeatHouse

Full-stack TypeScript monorepo with Fastify API, Next.js frontend, Prisma ORM, and Docker for Dokploy deployment.

## Tech Stack

| Layer      | Technology                               |
| ---------- | ---------------------------------------- |
| Monorepo   | pnpm workspaces + Turborepo              |
| Backend    | Fastify v5, TypeScript, ESM              |
| Frontend   | Next.js 15 (App Router), React 19        |
| ORM        | Prisma 7 (PostgreSQL)                    |
| Validation | TypeBox (JSON Schema + TypeScript types) |
| Testing    | Vitest, @vitest/coverage-v8              |
| Linting    | ESLint 9 (flat config), Prettier         |
| Hooks      | Husky, lint-staged                       |
| CI         | GitHub Actions                           |
| Docker     | Multi-stage Dockerfiles                  |
| Deployment | Dokploy (docker-compose)                 |

## Prerequisites

- Node.js >= 22.0.0
- pnpm (via corepack)
- Docker & Docker Compose
- Git

## Getting Started

```bash
# Enable corepack (one-time)
corepack enable
corepack prepare pnpm@9.15.0 --activate

# Clone and install
git clone <repo-url>
cd meathouse
pnpm install

# Start postgres + api + web
pnpm dev:full
```

**Services:**

- Frontend: http://localhost:3000
- API: http://localhost:3001
- Swagger docs: http://localhost:3001/api-docs
- PostgreSQL: localhost:5433

## Project Structure

```
meathouse/
├── apps/
│   ├── api/                    # Fastify backend
│   │   ├── src/
│   │   │   ├── config/         # Env validation (@fastify/env)
│   │   │   ├── plugins/        # Fastify plugins (cors, helmet, swagger, etc.)
│   │   │   ├── modules/        # Route modules (health, etc.)
│   │   │   ├── shared/         # Error classes, utilities
│   │   │   ├── app.ts          # Fastify factory
│   │   │   └── server.ts       # Entry point + graceful shutdown
│   │   ├── __tests__/          # API tests
│   │   └── Dockerfile
│   └── web/                    # Next.js frontend
│       ├── app/                # App Router pages
│       ├── src/__tests__/      # Web tests
│       └── Dockerfile
├── packages/
│   ├── typescript-config/      # Shared tsconfig presets (base, nextjs, node)
│   ├── types/                  # Shared TypeScript types (ApiResponse, User)
│   ├── db/                     # Prisma 7 schema + client
│   └── eslint-config/          # Shared ESLint configs (base, react, node)
├── docker-compose.yml          # Dokploy production
├── docker-compose.dev.yml      # Local dev (postgres only)
└── turbo.json                  # Task pipeline
```

## Available Scripts

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

## Development

### Database

```bash
# Start postgres
docker-compose -f docker-compose.dev.yml up -d

# Generate Prisma client
pnpm db:generate

# Run migrations
pnpm db:migrate

# Open Prisma Studio
pnpm db:studio
```

### Environment Variables

Copy `.env.example` to `.env` in `apps/api/`:

```bash
cp apps/api/.env.example apps/api/.env
```

Required variables:

| Variable       | Description                  | Default       |
| -------------- | ---------------------------- | ------------- |
| `DATABASE_URL` | PostgreSQL connection string | (required)    |
| `PORT`         | API server port              | `3001`        |
| `HOST`         | API server host              | `0.0.0.0`     |
| `NODE_ENV`     | Environment                  | `development` |
| `LOG_LEVEL`    | Pino log level               | `info`        |
| `CORS_ORIGIN`  | Allowed CORS origins         | `*`           |

## Testing

```bash
# Run all tests
pnpm test

# Run with coverage (enforces 60% minimum)
pnpm test:coverage

# Run tests for a specific package
pnpm --filter @repo/api test
pnpm --filter @repo/web test
```

Coverage thresholds (60% lines, functions, branches, statements) are enforced in `vitest.config.ts` for each app.

### Adding a Test

**API test** (`apps/api/src/__tests__/`):

```ts
import { describe, it, expect } from "vitest";
import { buildApp } from "../app.ts";

describe("My Route", () => {
  it("returns 200", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/my-route" });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
```

**Web test** (`apps/web/src/__tests__/`):

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import MyComponent from "../app/my-component";

describe("MyComponent", () => {
  it("renders correctly", () => {
    render(<MyComponent />);
    expect(screen.getByText("Hello")).toBeDefined();
  });
});
```

## Adding Packages

### New Shared Package

```bash
# 1. Create the package
mkdir -p packages/my-package/src
```

`packages/my-package/package.json`:

```json
{
  "name": "@repo/my-package",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "devDependencies": {
    "@repo/typescript-config": "workspace:*",
    "typescript": "^5.8.0"
  }
}
```

`packages/my-package/tsconfig.json`:

```json
{
  "extends": "@repo/typescript-config/node.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

```bash
# 2. Install dependencies
pnpm install

# 3. Use in other packages
# In apps/api/package.json:
#   "@repo/my-package": "workspace:*"
```

### New App

```bash
mkdir -p apps/my-app/src
```

Follow the same pattern as `apps/api/` or `apps/web/`. Add the package to `turbo.json` tasks if needed.

## Adding API Modules

```bash
# 1. Create module directory
mkdir -p apps/api/src/modules/my-module
```

**Schemas** (`apps/api/src/modules/my-module/schemas.ts`):

```ts
import { Type } from "@sinclair/typebox";

export const MyResponse = Type.Object({
  id: Type.String(),
  name: Type.String(),
});
```

**Routes** (`apps/api/src/modules/my-module/routes.ts`):

```ts
import type { FastifyInstance } from "fastify";
import { MyResponse } from "./schemas.ts";

export default async function myModuleRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/my-resource",
    {
      schema: {
        description: "Get my resource",
        tags: ["my-module"],
        response: { 200: MyResponse },
      },
    },
    async (_request, reply) => {
      return reply.send({ id: "1", name: "example" });
    },
  );
}
```

**Register** (`apps/api/src/app.ts`):

```ts
await app.register(myModuleRoutes, { prefix: "/api/v1" });
```

## Docker & Deployment

### Local Development

```bash
pnpm dev:full    # Start postgres + api + web
pnpm dev:down    # Stop postgres
```

### Dokploy Deployment

1. Create a Docker Compose service in Dokploy
2. Connect your Git repository
3. Set the compose path to `./docker-compose.yml`
4. Configure environment variables in the Dokploy Environment tab:
   - `DATABASE_URL` — pointing to Dokploy-managed postgres
   - `CORS_ORIGIN` — your frontend domain
   - `NEXT_PUBLIC_API_URL` — your API domain
5. Configure domains in the Dokploy Domains tab
6. Deploy

The `docker-compose.yml` connects both services to `dokploy-network`. Dokploy handles domain routing, SSL, and reverse proxy via Traefik.

## Commit Convention

All commits must follow the `topic: message` format.

| Topic      | Usage                     |
| ---------- | ------------------------- |
| `feat`     | New feature               |
| `fix`      | Bug fix                   |
| `init`     | Initial setup             |
| `chore`    | Maintenance, dependencies |
| `docs`     | Documentation             |
| `refactor` | Code restructuring        |
| `test`     | Adding/updating tests     |
| `ci`       | CI/CD changes             |

**Examples:**

```
feat: add user authentication
fix: resolve login redirect bug
init: scaffold project structure
chore: update dependencies
docs: add README setup guide
```

Enforced by `.husky/commit-msg` hook.

## CI/CD

GitHub Actions runs on push to `main` and pull requests:

1. **Lint** — runs `turbo run lint` across all packages
2. **Test** — runs `turbo run test:coverage` with 60% threshold enforcement

Both jobs use pnpm caching and Turborepo cache for fast CI.

## License

MIT
