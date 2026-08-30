# syntax=docker/dockerfile:1

# Debian, not Alpine, and the same base in every stage. `prisma generate` emits
# a native query engine for the platform that ran it — here
# libquery_engine-debian-openssl-3.0.x.so.node — so a musl runtime would load a
# binary it cannot use, and the app would die on its first database query.
ARG NODE_IMAGE=node:24-bookworm-slim

# ----------------------------------------------------------------------- base
FROM ${NODE_IMAGE} AS base

# OpenSSL must be present in *every* stage, not only at runtime. Prisma's
# library engine links against it, and `prisma generate` picks its binary target
# by detecting the installed version: on the bare slim image detection fails,
# Prisma falls back to openssl-1.1.x, and the image ends up carrying an engine
# its own 3.0 runtime cannot load. CI catches this now — see the docker job.
RUN apt-get update && \
    apt-get install -y --no-install-recommends openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1

# ---------------------------------------------------------------- dependencies
FROM base AS deps
WORKDIR /app

# Corepack reads the pinned version from package.json's `packageManager`.
RUN corepack enable || npm install -g pnpm@10.13.1

# Only the files `pnpm install` needs, so a source edit does not invalidate the
# dependency layer. prisma.config.ts and the schema are in this list because
# `postinstall` runs `prisma generate`, which reads both — the install fails
# without them. No database URL is required: prisma.config.ts reads MONGODB_URI
# directly rather than through prisma/config's `env()`, which throws when unset.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma/schema.prisma ./prisma/

RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store \
    pnpm config set store-dir /pnpm-store && \
    pnpm install --frozen-lockfile

# --------------------------------------------------------------------- builder
FROM base AS builder
WORKDIR /app

RUN corepack enable || npm install -g pnpm@10.13.1

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma/generated ./prisma/generated
COPY . .

# Needs network: app/layout.tsx pulls Geist, Geist Mono and Inter through
# next/font/google at build time. Needs no secrets: lib/env.ts skips validation
# while NEXT_PHASE is phase-production-build, and Next does not run
# instrumentation.ts during a build.
RUN pnpm build

# ---------------------------------------------------------------------- runner
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs

# The standalone bundle carries its own traced node_modules and server.js.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Copied explicitly rather than left to Next's file tracing: the query engine is
# a .so loaded at runtime, and prisma/generated/client.ts resolves it from
# process.cwd() — which is this directory.
COPY --from=builder --chown=nextjs:nodejs /app/prisma/generated ./prisma/generated

USER nextjs
EXPOSE 3000

# Node 24 has a global fetch, so this needs no curl or wget in the image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
