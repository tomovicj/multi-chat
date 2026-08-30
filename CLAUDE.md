# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev                 # Next.js dev server on http://localhost:3000
pnpm build               # production build (also type-checks)
pnpm lint                # ESLint flat config (next core-web-vitals + typescript)
pnpm typecheck           # tsc --noEmit — much faster feedback than a full build
pnpm topup <email> <$>   # grant credit; there is no admin UI or payment provider
npx prisma generate      # regenerate client into prisma/generated (also runs on postinstall)
npx prisma db push       # only needed for INDEX changes (see below)
npx prisma studio        # DB browser
docker compose up --build   # run the production image locally, reads .env
```

pnpm only — the lockfile and `pnpm-workspace.yaml` (`ignoredBuiltDependencies`) assume it.
`prisma/generated/` is gitignored, so a fresh clone type-checks only after `pnpm install` runs
`postinstall`. There is no test framework — do not invent a test command.

**MongoDB schema changes rarely need `db push`.** Mongo is schemaless, so adding or renaming a
scalar field only requires `npx prisma generate`; `db push` matters for indexes. But `@default` is
applied on *write*, not on read, so making a new required field on an existing collection will make
Prisma throw on every row written before it. Declare such fields optional and convert lazily — see
`readBalanceMicros` in `lib/billing.ts` for the pattern in use. `prisma.config.ts` names a
`prisma/migrations` path that does not exist; Mongo does not use migrations.

## Git workflow

**Branch, commit small, open a PR.** Do not commit onto `dev` directly and do not deliver a change
as one large commit.

- `main` is the default branch but `dev` is where work integrates, so branch off `dev` and target
  the PR at `dev` unless told otherwise.
- Split the work into commits that each stand alone: one coherent concern per commit, and each one
  should build if checked out on its own. That usually means a new module ships together with the
  call sites that use it, while unrelated concerns — a config fix, a new endpoint, documentation —
  stay in separate commits.
- When one file (typically `package.json`) belongs to two commits, write its intermediate content,
  commit, then write the final content and commit again. That is more reliable than trying to stage
  individual hunks non-interactively.
- Push the branch and open the PR with `gh pr create`.

## Architecture

### Auth (better-auth + Prisma/MongoDB)

`lib/auth.ts` **default-exports** the better-auth instance (`import auth from "@/lib/auth"` — the
existing `AGENTS.md` shows a named import, which is wrong). Google is the only social provider.
`app/api/auth/[...all]/route.ts` mounts the handler.

- Server (components, actions, route handlers): `await auth.api.getSession({ headers: await headers() })`
- Client: `authClient` from `@/lib/auth-client` (`authClient.useSession()`, `authClient.signIn.social`)

There is **no middleware**. Every entry point guards itself: server components/actions `throw new
Error("Unauthorized")`, the route handlers return a 401 JSON body, and client pages
(`app/chat/page.tsx`, `app/login/page.tsx`) redirect in a `useEffect` after `isPending` clears.
`User`, `Session`, `Account`, `Verification` in `prisma/schema.prisma` are better-auth's tables
(`@@map`ped to lowercase); `balanceMicros` and `chats` are the app's additions to `User`.

### Chat persistence — messages are a JSON *string*

`Chat.messages` is a Prisma `Json` column, but every write stringifies, so it holds a JSON-encoded
string rather than an array. Never parse it inline: use `parseStoredMessages` in
`lib/chat/thread.ts`, which tolerates a string, a raw array, and garbage alike.

### The chat request round-trip

The core of the app, spanning `chat-thread.tsx`, `app/api/chat/route.ts`, `lib/chat/thread.ts` and
`lib/chats.ts`:

1. **The client owns the chat id.** `ChatThread` mints one with `crypto.randomUUID()` in a lazy
   `useState` for a new thread, or reuses the route param, and always posts it. Nothing needs to
   travel back up the stream, so finishing is a plain `router.replace` rather than a query for
   whichever chat was created most recently.
2. The route checks the session, refuses with **402** on an empty balance, then looks the id up. A
   chat owned by someone else is answered **404** so ids cannot be probed.
3. **`reconcile` (`lib/chat/thread.ts`) is the integrity check.** The client may send a prefix of
   the stored thread plus at most one new trailing user message. A *shorter* prefix is an edit or a
   regenerate, which deliberately rewrites history from that point — that is the product behaviour.
   Divergence (an id where the server has a different one) is a **409**. The `base` it returns is
   the server's own copies, so the prompt is never the client's version of history, and metadata on
   the incoming user message is stripped rather than trusted.
4. The thread is written **before** streaming, so the client can navigate the instant the stream
   ends and a stream that dies midway still keeps the user's message.
5. `toUIMessageStreamResponse({ originalMessages, messageMetadata, onFinish })` does the rest. Use
   this rather than reconstructing the assistant message by hand: it preserves reasoning and tool
   parts, and its `onFinish` also fires on abort, so a stopped reply is kept instead of lost.

Errors surface as `sonner` toasts, matched by substring on the error message (`"409"`, `"402"`,
`"401"`) — the status code is not otherwise available to the client.

### Per-message attribution

`lib/chat/message-metadata.ts` holds one zod schema used by both halves: the route passes it through
`messageMetadata` while streaming, the client declares it as `messageMetadataSchema` on
`useChatRuntime`. Because metadata lives on the `UIMessage`, it survives persistence and reload for
free, and `ChatThreadWrapper` reads the last assistant message's metadata to restore the picker when
a chat is reopened.

**Metadata must be nested under `custom`.** assistant-ui's message converter copies only an
allowlist of keys onto the rendered message (`unstable_state`, `unstable_annotations`,
`unstable_data`, `steps`, `custom`, `submittedFeedback`); anything flat is silently dropped. Read it
back with `useAuiState((s) => s.message.metadata.custom)`.

### The model catalog

`lib/models/catalog.ts` fetches OpenRouter's `/api/v1/models` (~400 models, ~650 KB) and trims it to
the fields the picker renders. The provider package ships no listing helper, so this calls REST
directly. Server-only by convention like `lib/billing.ts` — its one importer is `app/api/models/route.ts`.

- Cached across requests with `next: { revalidate: 3600 }`, plus a module-level `lastGood` so an
  outage degrades to stale rather than empty, and `SEED_MODELS` behind that.
- The client fetches **lazily on first popup open** (`use-model-catalog.ts`, memoised at module
  level). Never put the catalog in the layout's RSC payload; it is far too big to pay for on every
  page load.
- `model-store.ts` persists a `SelectedModel` *snapshot* (id + name + provider label), not a bare
  id, so the header labels correctly on first paint with no catalog and a model that disappears from
  OpenRouter still shows its last known name. It is `persist` version 2 with a `migrate` off the v1
  bare-id shape — bump both together if the shape changes again.
- Catalog gotchas, all live in the real payload: pricing strings of `"-1"` mean **variable**, not
  free; ~12 entries are aliases (`alias_target`, or an id starting with `~`) and are dropped as
  duplicates; names arrive as `"Anthropic: Claude Opus 5"` and the prefix is a nicer provider label
  than the id slug.

### Billing — micro-dollars

`User.balanceMicros` is the ledger, in millionths of a dollar. Whole cents were unusable: a real
turn on a cheap model costs ~0.02¢, which rounding to cents overcharges ~50×.

- Real cost comes from OpenRouter itself — `usage: { include: true }` on the model settings, then
  `providerMetadata.openrouter.usage.cost` (USD). Note `providerMetadata` rides on the
  **`finish-step`** stream part, not `finish`.
- When no cost is reported, `estimateCostUsd` prices it from the live catalog. There is no hardcoded
  price table any more, and there should not be one again.
- `deductCost` and `readBalanceMicros` live in `lib/billing.ts`, deliberately **not** server actions
  (see the conventions below). `lib/money.ts` holds the pure unit helpers so client components can
  format a balance without pulling Prisma into the browser bundle.
- The balance gate is `<= 0`, so a user can still overdraw by at most one turn.

### Sidebar (server-seeded, client-paginated)

`sidebar.tsx` is a server component that queries the first 20 chats and the balance, and hands them
to `sidebar-content.tsx` (client), which owns 300ms-debounced search, cursor pagination via the
`getChats` server action, `react-intersection-observer` infinite scroll, and date grouping. Emptying
the search resets to the server-rendered `initialChats` rather than refetching, so `router.refresh()`
is what makes a new, renamed or deleted chat appear.

## Infrastructure

The app builds and runs with **no secrets**, and validates configuration on **startup**. Two traps
are load-bearing to that and are easy to undo by accident:

- **`prisma.config.ts` must not use `env()` from `prisma/config`.** That helper *throws* when the
  variable is unset, and the config file is loaded by every Prisma CLI command — including the
  `prisma generate` that `postinstall` runs. Using it makes `pnpm install` fail in CI, in Docker and
  on any clean checkout without a database. It reads `process.env.MONGODB_URI` directly instead, and
  falls back to an obviously-invalid URL so commands that really connect still fail legibly.
- **The Docker image must stay Debian in every stage.** `prisma generate` emits a native query
  engine for whatever platform ran it — here `libquery_engine-debian-openssl-3.0.x.so.node` — and
  `prisma/generated/client.ts` resolves it from `process.cwd()`. Alpine needs
  `linux-musl-openssl-3.0.x`, so a musl runtime dies on the first query. The runner stage copies
  `prisma/generated` explicitly rather than trusting Next's file tracing to carry a `.so`.

`lib/env.ts` is the only place that reads a secret from `process.env`; everything else calls `env()`.
It parses once, reports *every* bad variable at once, and short-circuits while
`NEXT_PHASE === "phase-production-build"` — which is what lets `next build` and `docker build` run
without credentials. The real check is `instrumentation.ts`, whose `register()` Next runs at server
boot and (verified in Next's own source) deliberately *not* during a build.

`lib/auth-client.ts` passes **no `baseURL`**: better-auth falls back to `window.location.origin`.
Naming one would mean a `NEXT_PUBLIC_*` variable, and those are inlined at build time — which would
pin every built image to a single hostname. The server side sets `baseURL` from `BETTER_AUTH_URL`.

`/api/health` is liveness only and never touches Mongo, so an upstream blip cannot turn into a
restart loop. `.github/workflows/ci.yml` runs typecheck, lint and build plus an independent
`docker build`; making them block a merge is a branch-protection setting, not a file.

## Conventions

- **Imports:** always the `@/*` alias, never relative paths (`@/` maps to the repo root).
- **Prisma:** import the singleton `prisma` from `@/lib/prisma`; never construct a `PrismaClient`.
  The generated client lives at `@/prisma/generated/client`, not `@prisma/client`.
- **Types:** `type` aliases, not `interface`. Props typed inline for small components.
- **Server actions are public endpoints.** Everything exported from a `"use server"` module is a
  POST endpoint any client can call with arguments of its choosing. An action must therefore be safe
  under hostile arguments and must **never** accept a caller-supplied user id — derive it from the
  session. Anything failing that bar goes in a plain module instead: `lib/billing.ts` (a balance
  mutation that could be handed a negative amount) and `lib/chats.ts` (chat writes taking an
  arbitrary id, title and message blob). Both take `userId` from a caller that already resolved the
  session and scope their `where` by it.
- **Server components by default.** `"use client"` only for interactivity; `app/chat/_components/`
  is a private (non-routable) folder by the `_` prefix.
- **Semicolons are mixed.** The older code (`lib/actions/`, `app/chat/_components/sidebar/`,
  `app/layout.tsx`, `app/login/page.tsx`) uses them; the AI-chat code does not. Match the file you
  are editing. Double quotes, 2-space indent, no Prettier configured.
- **Styling:** Tailwind v4 via `@import` in `app/globals.css` (no tailwind.config), oklch CSS
  variables under `@theme inline`. Dark mode is `next-themes` with `attribute="class"`, which pairs
  with the `@custom-variant dark (&:is(.dark *))` already in the stylesheet. Compose classes with
  `cn()` from `@/lib/utils`. shadcn is configured for the `radix-vega` style, `gray` base colour.

## Vendored UI

`components/ui/` and `components/assistant-ui/` are generated. Two local patches to know about, both
of which a regenerator would clobber:

- `attachment.tsx` — `useFileSrc` derives its object URL with `useMemo` and revokes it in an effect
  cleanup, instead of the upstream state-plus-effect that trips `react-hooks/set-state-in-effect`.
- `thread.tsx` — renders `Reasoning` / `ReasoningGroup` (assistant-ui defaults them to `() => null`,
  so thinking models would otherwise show a blank pause) and `MessageMeta`, and the branch picker is
  **removed**: branches are client-only state that does not survive a reload.

`components/ui/combobox.tsx` is a full base-ui Combobox with grouping (`ComboboxGroup`,
`ComboboxCollection`) and external filtering via `filteredItems` — that is what the model picker
uses to search ~400 models without a virtualizer.

## Known gaps

- A stale second tab sending a message looks identical to an edit — both arrive as "a prefix plus
  one new message" — so it still truncates. Distinguishing them needs the client to report the head
  it believed in, or a store that never deletes.
- Tool calls are wired in the UI (`tool-fallback.tsx`) but `streamText` is never given `tools`, so
  the component is unreachable.
- Attachments round-trip as base64 data URLs inside `Chat.messages`, with no upload endpoint, size
  cap, or blob store. Mongo's 16 MB document limit is the de facto ceiling.
- `pnpm lint` exits 0 with two warnings, both pre-existing: an unused `SidebarTrigger` import in
  `app/chat/layout.tsx`, and `no-img-element` in the vendored attachment preview.

## Other files

`README.md` is the human-facing setup guide: prerequisites, environment variables, Docker and CI.
`AGENTS.md` covers some of the same ground more prescriptively; it predates all of the above, and
its "no semicolons" rule and named `auth` import are both wrong for the current tree.
`agents-init.md` is an exported session transcript, not guidance.
