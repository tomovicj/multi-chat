# Multi Chat

Chat with models from every provider through a single OpenRouter key, with
per-message model attribution and a prepaid balance metered in micro-dollars.

Next.js 16 (App Router) · React 19 · Prisma + MongoDB · better-auth · AI SDK v6
· assistant-ui · Tailwind v4.

## Requirements

- **Node 20.9+** (CI and the Docker image use 24)
- **pnpm** — the lockfile and `pnpm-workspace.yaml` assume it. `corepack enable`
  picks up the version pinned in `package.json`.
- **MongoDB as a replica set.** Prisma's MongoDB connector needs one for
  transactions. Atlas provides it by default; a bare local `mongod` does not
  (start it with `--replSet rs0` and run `rs.initiate()` once).
- A **Google OAuth client** and an **OpenRouter API key** — see `.env.example`,
  which documents where each value comes from.

## Setup

```bash
cp .env.example .env      # then fill in every value
pnpm install              # postinstall runs `prisma generate`
pnpm dev                  # http://localhost:3000
```

`prisma/generated/` is gitignored, so a fresh clone only type-checks after
`pnpm install` has run `postinstall`.

Sign in once with Google, then grant yourself credit — there is no admin UI and
no payment provider:

```bash
pnpm topup you@example.com 5
```

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server |
| `pnpm build` | Production build (also type-checks) |
| `pnpm typecheck` | `tsc --noEmit` — much faster feedback than a full build |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest, once (`pnpm vitest` to watch) |
| `pnpm topup <email> <dollars>` | Add credit to an account |
| `npx prisma generate` | Regenerate the client into `prisma/generated` |
| `npx prisma studio` | Browse the database |

The tests are Vitest, run in Node with every I/O boundary mocked, so they need
no database, no secrets and no network. `tests/` mirrors the source tree.

**Schema changes rarely need `npx prisma db push`.** Mongo is schemaless, so
adding or renaming a scalar field only needs `prisma generate`; `db push`
matters for indexes.

## Docker

The image is self-contained: it runs `prisma generate` and `next build`
internally and needs **no secrets at build time**.

```bash
docker compose up --build        # reads .env, serves on :3000
```

or directly:

```bash
docker build -t multi-chat .
docker run --rm -p 3000:3000 --env-file .env multi-chat
```

Configuration is validated on startup by `instrumentation.ts`, so a container
missing a variable exits immediately naming every one that is wrong, rather
than failing on someone's first message.

Two things to know when hosting it:

- **Set `BETTER_AUTH_URL` to the origin the browser actually visits.** It is
  what the Google OAuth callback is built against, and that same URL must be
  registered as an authorised redirect URI in the Google console.
- **Raise your reverse proxy's read timeout above 120s.** Model replies stream
  for a long time, and a proxy defaulting to 60s cuts them off mid-answer.
  (`maxDuration = 120` in `app/api/chat/route.ts` is a serverless hint and has
  no effect on a self-hosted Node server.)

The Dockerfile is deliberately Debian-based in **every** stage. `prisma
generate` emits a native query engine for the platform that ran it
(`libquery_engine-debian-openssl-3.0.x.so.node`), so an Alpine runtime would
load a binary it cannot use and die on the first database query.

## CI

`.github/workflows/ci.yml` runs typecheck, lint, test and build on pushes to
`main` and `dev` and on every PR, plus an independent job that builds the Docker image.
It needs no secrets.

Making those checks *block* a merge is a repository setting, not a file —
enable branch protection on `main` with both jobs marked as required.

## Architecture

See `CLAUDE.md`, which documents the chat request round-trip, the reconciliation
guard that stops a stale tab from clobbering a thread, the model catalog's
caching and fallbacks, the micro-dollar ledger, and the local patches carried in
the vendored `components/ui/` and `components/assistant-ui/` files.
