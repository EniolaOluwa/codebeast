FROM node:22-alpine AS base
RUN corepack enable
RUN corepack prepare pnpm@9.15.0 --activate
ENV HUSKY=0

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json ./apps/api/
COPY packages/types/package.json ./packages/types/
COPY packages/db/package.json ./packages/db/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/eslint-config/package.json ./packages/eslint-config/
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app ./
COPY . .
RUN pnpm --filter @repo/api build
RUN pnpm --filter @repo/api deploy --prod /prod/api && rm -f /prod/api/.env

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 fastify

COPY --from=builder --chown=fastify:nodejs /prod/api ./

USER fastify
EXPOSE 3001

CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy --schema node_modules/@repo/db/prisma/schema.prisma && exec node dist/server.js"]
