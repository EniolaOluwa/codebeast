FROM node:22-bookworm AS base
RUN corepack enable
RUN corepack prepare pnpm@9.15.0 --activate
ENV HUSKY=0

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/agent/package.json ./apps/agent/
COPY packages/types/package.json ./packages/types/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/eslint-config/package.json ./packages/eslint-config/
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app ./
COPY . .
RUN pnpm --filter @repo/agent... build
RUN pnpm --filter @repo/agent deploy --prod /prod/agent && rm -f /prod/agent/.env

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
# Docker CLI so the agent can start sandbox containers via the mounted socket.
RUN apt-get update \
  && apt-get install -y --no-install-recommends docker.io git ripgrep \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /prod/agent ./

EXPOSE 3002
CMD ["node", "dist/main.js"]
