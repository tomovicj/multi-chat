# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev                 # Next.js dev server on http://localhost:3000
pnpm build               # production build (also type-checks)
pnpm lint                # ESLint flat config (next core-web-vitals + typescript)
npx tsc --noEmit         # type-check only — much faster feedback than a full build
npx prisma db push       # push schema.prisma to MongoDB (no migrations — Mongo datasource)
npx prisma generate      # regenerate client into prisma/generated (also runs on postinstall)
npx prisma studio        # DB browser
```

pnpm only — the lockfile and `pnpm-workspace.yaml` (`ignoredBuiltDependencies`) assume it.
`prisma/generated/` is gitignored, so a fresh clone type-checks only after `pnpm install` runs
`postinstall`. There is no test framework — do not invent a test command.

`prisma.config.ts` declares a `prisma/migrations` path, but that directory does not exist and
MongoDB does not use migrations; schema changes go through `db push`.

## Architecture

### Auth (better-auth + Prisma/MongoDB)

`lib/auth.ts` **default-exports** the better-auth instance (`import auth from "@/lib/auth"` — the
existing `AGENTS.md` shows a named import, which is wrong). Google is the only social provider.
`app/api/auth/[...all]/route.ts` mounts the handler.

- Server (components, actions, route handlers): `await auth.api.getSession({ headers: await headers() })`
- Client: `authClient` from `@/lib/auth-client` (`authClient.useSession()`, `authClient.signIn.social`)

There is **no middleware**. Every entry point guards itself: server components/actions `throw new
Error("Unauthorized")`, `/api/chat` returns a 401 JSON body, and client pages (`app/chat/page.tsx`,
`app/login/page.tsx`) redirect in a `useEffect` after `isPending` clears. `User`, `Session`,
`Account`, `Verification` in `prisma/schema.prisma` are better-auth's tables (`@@map`ped to
lowercase); `balanceCents` and `chats` are the app's additions to `User`.

### Chat persistence — messages are a JSON *string*

`Chat.messages` is a Prisma `Json` column, but every write in `lib/actions/chat.ts` passes
`JSON.stringify(messages)`, so it holds a JSON-encoded string, not an array. Read paths must
defensively parse (see `app/chat/[id]/page.tsx`). Keep both halves in mind when touching either.

### The chat request round-trip

This flow spans four files and is the core of the app:

1. **The client owns the chat id.** `ChatThread` (`app/chat/_components/chat-thread.tsx`) mints one
   with `crypto.randomUUID()` in a lazy `useState` for a new thread, or reuses the one from the
   route params, and always posts it. Nothing needs to travel back up the stream as a result.
2. `app/api/chat/route.ts` checks the session, refuses with **402** when `balanceCents <= 0`, then
   looks the id up: a chat owned by someone else is answered as a **404** so ids cannot be probed,
   and an id with no row yet is created on the spot via `createChat(chatId, title, messages)`.
3. Only then does it stream from OpenRouter (`createOpenRouter(...).chat(modelId)` + `streamText`).
   Persisting *before* the stream is deliberate: it means the client can navigate the instant the
   stream ends without racing the handler, and a stream that dies midway still keeps the user's
   message.
4. In `onFinish`, the route computes cost from `usage` against the hardcoded `MODEL_PRICING` table,
   calls `deductCost()`, and `updateChatMessages(chatId, ...)` with the assistant reply appended.
   Failures there are swallowed so the stream still completes.
5. The client's `onFinish` does `router.replace("/chat/<id>")` for a new thread — it already knew
   the id at step 1 — and `router.refresh()` in both cases so the server-rendered sidebar picks up
   the new or renamed chat.

Because the id is client-supplied, **any new write path must re-check ownership** the way step 2
does; `updateChatMessages` and `getChatById` do it by scoping `where` with `userId`.

Errors surface as `sonner` toasts, matched by substring on the error message (`"402"`,
`"insufficient"`, `"401"`) — the status code is not otherwise available to the client.

### Billing

`User.balanceCents` is the only ledger; there is no transaction record. `MODEL_PRICING` in
`app/api/chat/route.ts` must be kept in sync with `MODELS` in
`app/chat/_components/model-selector.tsx` — they are two independent hardcoded lists keyed by the
same OpenRouter model ids, and an unlisted id silently falls back to 100/300 cents per 1M tokens.
`Balance` in the sidebar reads `getUserBalance()` on mount and on a manual refresh button; it does
not update after a message is sent.

`deductCost` lives in `lib/billing.ts` and is deliberately **not** a server action: it takes the user
id from its caller, which has already resolved the session, and rejects any cost that is not a
positive integer. Every export of a `"use server"` module is a POST endpoint clients can call with
arguments of their choosing, so a balance mutation reachable that way can be handed a negative amount
to credit the account. Privileged mutations belong here, not in `lib/actions/`.

### Sidebar (server-seeded, client-paginated)

`sidebar.tsx` is a server component that queries the first 20 chats with Prisma directly and hands
them to `sidebar-content.tsx` (client), which then owns everything: 300ms-debounced search, cursor
pagination via the `getChats` server action, `react-intersection-observer` for infinite scroll, and
grouping by `toDateString()`. Emptying the search resets to the server-rendered `initialChats`
rather than refetching. `getChats` returns `{ chats, nextCursor, hasMore }` using the
fetch-`limit + 1` / `skip: 1` cursor idiom — reuse it for any new paginated list.

### Model selection

A `zustand` + `persist` store (localStorage key `model-selection`) read by `ChatHeader` and each
page, then passed down as a `selectedModel` prop. `assistant-ui` presentational components live in
`components/assistant-ui/` and are vendored (generated), like `components/ui/`.

## Conventions

- **Imports:** always the `@/*` alias, never relative paths (`@/` maps to the repo root).
- **Prisma:** import the singleton `prisma` from `@/lib/prisma`; never construct a `PrismaClient`.
  The generated client lives at `@/prisma/generated/client`, not `@prisma/client`.
- **Types:** `type` aliases, not `interface`. Props typed inline for small components.
- **Server actions** live in `lib/actions/` under `"use server"`, and each one re-checks the session
  itself; mutations scope their `where` clause by `userId` as the authorization check. Every export
  there is a public endpoint, so an action must be safe to invoke with hostile arguments and must
  never accept a caller-supplied user id — derive it from the session, as `getUserBalance()` does.
  Anything that fails that bar goes in a plain module like `lib/billing.ts` instead.
- **Server components by default.** `"use client"` only for interactivity; `app/chat/_components/`
  is a private (non-routable) folder by the `_` prefix.
- **Semicolons are mixed.** The older committed code (`lib/`, `app/chat/_components/sidebar/`,
  `app/layout.tsx`, `app/login/page.tsx`) uses them; the newer AI-chat code does not. Match the file
  you are editing. Double quotes, 2-space indent, no Prettier configured.
- **Styling:** Tailwind v4 via `@import` in `app/globals.css` (no tailwind.config), oklch CSS
  variables under `@theme inline`, dark mode through the `.dark` variant. Compose classes with `cn()`
  from `@/lib/utils`. shadcn is configured for the `radix-vega` style with the `gray` base color.

## The in-flight AI chat feature

`app/api/chat/`, `app/chat/_components/`, and `components/assistant-ui/` are untracked work in
progress. They type-check and build, but note the AI SDK v5 → v6 conventions the installed `ai@6`
requires, since v5-shaped snippets are still common:

- Token usage is `usage.inputTokens` / `usage.outputTokens`, and both are `number | undefined`.
- `UIMessage` has no `content`; text lives in `message.parts`. Use the `isTextUIPart` guard from
  `ai` to pull text out (see `getMessageText` in `app/api/chat/route.ts`).
- `useChatRuntime` takes v6 `ChatInit`: `messages` for the initial thread and a `transport` object
  — **not** `api` / `body` / `initialMessages`. Pass `AssistantChatTransport` from
  `@assistant-ui/react-ai-sdk` rather than the plain `DefaultChatTransport`; it is what the hook
  defaults to, and it forwards the runtime's system prompt and tool definitions in the request body
  alongside your own `body` fields. `useChatRuntime` re-reads the transport through a proxy each
  render, so constructing it inline is fine and picks up changing `body` values.

`components/assistant-ui/` is vendored/generated, but `attachment.tsx` carries a local patch:
`useFileSrc` derives the object URL with `useMemo` and revokes it in an effect cleanup, instead of
the upstream state-plus-effect version that trips `react-hooks/set-state-in-effect`. Re-running the
assistant-ui generator will clobber that patch and reintroduce the lint error.

`pnpm lint` exits 0 with four warnings, none of them new: an unused `setCurrentChatId` (the unused
half of the chat-id workaround above), an unused `SidebarTrigger` import in `app/chat/layout.tsx`,
an `exhaustive-deps` warning in `balance.tsx`, and `no-img-element` in the vendored attachment
preview.

## Other files

`AGENTS.md` covers much of the same ground in more prescriptive detail; it predates the AI chat
feature, and its "no semicolons" rule and named `auth` import are both inaccurate for the current
tree. `agents-init.md` is just the exported transcript of the session that generated it, not
guidance.
