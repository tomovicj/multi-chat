# AGENTS.md - Development Guidelines for AI Coding Agents

This document provides guidelines for AI coding agents working in this repository.

## Project Overview

**Tech Stack:**
- Next.js 16.1.6 (App Router) + React 19.2.3 + TypeScript 5
- Prisma 6.19.2 (MongoDB) + better-auth 1.4.18
- Tailwind CSS 4 + shadcn/ui (radix-vega style)
- Package manager: pnpm

**Project Structure:**
```
app/                     # Next.js App Router (pages, layouts, API routes)
  _components/           # Private page-specific components (not routable)
  api/                   # API routes
  chat/                  # Chat feature pages
components/ui/           # Reusable shadcn/ui components
lib/                     # Utilities, auth, database, server actions
  actions/               # Server actions for data mutations
prisma/                  # Database schema and generated client
hooks/                   # Custom React hooks
public/                  # Static assets
```

## Build, Lint, Test Commands

```bash
# Development
pnpm dev                 # Start Next.js dev server (http://localhost:3000)

# Build
pnpm build               # Production build (runs type checking)

# Lint
pnpm lint                # Run ESLint on all files
pnpm lint --fix          # Auto-fix linting issues

# Test
pnpm test                # Run the Vitest suite once
pnpm vitest              # Watch mode

# Database
npx prisma generate      # Generate Prisma client (auto-runs on install)
npx prisma db push       # Push schema changes to MongoDB
npx prisma studio        # Open Prisma Studio GUI

# Production
pnpm start               # Start production server (requires build)
```

**Testing:** Vitest, in `tests/`, mirroring the source tree. Every I/O boundary is mocked, so
the suite needs no database, no secrets and no network. See the Testing section of `CLAUDE.md`
before adding to it — the setup file's globals and the module-level singletons that need
`vi.resetModules()` are both easy to trip over.

## Code Style Guidelines

### TypeScript

**Strict mode enabled** - All code must pass strict type checking.

**Type vs Interface:**
- **Prefer `type` over `interface`** for all definitions
- Use inline types for simple prop definitions

```typescript
// ✅ Good - type alias
export type ChatListItem = {
  id: string
  title: string
  createdAt: Date
}

// ✅ Good - inline types
function Button({ className, variant }: {
  className?: string
  variant?: "default" | "outline"
}) { }

// ❌ Avoid - interface
interface ChatListItem {
  id: string
  title: string
}
```

**Type annotations:**
- Always type function parameters
- Explicitly declare return types for exported functions
- Use `React.ComponentProps<"element">` for component props

```typescript
export async function getChats(options?: {
  query?: string
  cursor?: string
  limit?: number
}): Promise<PaginatedChatsResult> {
  // implementation
}
```

### Imports

**Always use absolute imports** with `@/*` alias - never use relative imports.

```typescript
// ✅ Good
import { Button } from "@/components/ui/button"
import { getChats } from "@/lib/actions/chat"
import prisma from "@/lib/prisma"

// ❌ Avoid
import { Button } from "../../components/ui/button"
import { getChats } from "../actions/chat"
```

**Import ordering:**
1. External packages (React, Next.js, libraries)
2. Internal components (`@/components`, `@/app`)
3. Internal utilities/actions (`@/lib`, `@/hooks`)
4. Types (if separate)
5. Side effects (CSS imports)

### Formatting

**No semicolons** - This codebase does not use semicolons.

```typescript
// ✅ Good
const prisma = new PrismaClient()
export default prisma

// ❌ Avoid
const prisma = new PrismaClient();
export default prisma;
```

**Other formatting:**
- **Quotes:** Double quotes for strings (`"text"`)
- **Indentation:** 2 spaces
- **Trailing commas:** Use in multi-line arrays/objects
- **JSX:** Space before self-closing tags (`<Button />`)

```typescript
// ✅ Good formatting example
const config = {
  name: "multi-chat",
  version: "1.0",
  features: ["chat", "auth"],
}

<Button
  variant="outline"
  size="sm"
  onClick={handleClick}
/>
```

### Naming Conventions

**Files:** kebab-case
- `sidebar-content.tsx`, `chat-button.tsx`, `use-mobile.ts`
- Exception: `page.tsx`, `layout.tsx` (Next.js convention)

**Components:** PascalCase
- `ChatButton`, `SearchForm`, `UserInfo`

**Functions/Variables:** camelCase
- `getChats`, `handleSignOut`, `isLoading`, `debouncedQuery`

**Constants:** SCREAMING_SNAKE_CASE
- `MOBILE_BREAKPOINT`, `SIDEBAR_WIDTH`

**Types:** PascalCase with descriptive suffixes
- `ChatListItem`, `PaginatedChatsResult`, `UserProps`

**Booleans:** Use `is*`, `has*`, `should*` prefixes
- `isLoading`, `hasMore`, `shouldRender`

### React Components

**Server Components (default):**
- No `"use client"` directive
- Can use `async/await` directly
- Use for data fetching with Prisma
- Can import and use client components

```typescript
// ✅ Server component
export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const chat = await prisma.chat.findUnique({
    where: { id },
  })
  return <div>{chat.title}</div>
}
```

**Client Components:**
- Add `"use client"` directive at top
- Use for interactivity, hooks, state, event handlers
- Cannot import server components

```typescript
// ✅ Client component
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export function ChatButton({ chat }: { chat: ChatListItem }) {
  const [isActive, setIsActive] = useState(false)
  const router = useRouter()
  // ... interactive logic
}
```

**Component patterns:**
- Keep server/client boundary clear
- Prefer server components when possible
- Use server actions for mutations
- Props typed inline or via type alias

### Error Handling

**Throw errors directly in server components:**

```typescript
const session = await auth.api.getSession()
if (!session) {
  throw new Error("Unauthorized")
}
```

**Use try-catch for async operations in client components:**

```typescript
const handleSignOut = async () => {
  setIsSigningOut(true)
  try {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => router.push("/"),
      },
    })
  } catch (error) {
    console.error("Sign out error:", error)
    setIsSigningOut(false)
  }
}
```

**Handle loading states:**

```typescript
if (isPending) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Loading...</p>
    </div>
  )
}
```

### Database (Prisma)

**Always use the singleton Prisma client:**

```typescript
import prisma from "@/lib/prisma"

// ✅ Good
const chats = await prisma.chat.findMany({
  where: { userId },
  orderBy: { createdAt: "desc" },
})

// ❌ Avoid - don't create new instances
const prisma = new PrismaClient()
```

**Generated client location:** `prisma/generated` (custom output path)

**Schema changes workflow:**
1. Edit `prisma/schema.prisma`
2. Run `npx prisma db push` to sync with MongoDB
3. Run `npx prisma generate` to regenerate client (usually automatic)

### Authentication

**Server-side:** Use `auth.api.getSession()` from `@/lib/auth`

```typescript
import { auth } from "@/lib/auth"

const session = await auth.api.getSession({
  headers: await headers(),
})
```

**Client-side:** Use `authClient` from `@/lib/auth-client`

```typescript
import { authClient } from "@/lib/auth-client"

await authClient.signOut()
const session = authClient.useSession()
```

### Styling (Tailwind CSS)

- Use Tailwind utility classes
- Use `cn()` helper from `@/lib/utils` for conditional classes
- CSS variables defined in `app/globals.css` via `@theme inline`
- Dark mode: `.dark` class variant

```typescript
import { cn } from "@/lib/utils"

<div className={cn(
  "flex items-center gap-2",
  isActive && "bg-accent",
  className
)}>
```

## Common Patterns

### Server Actions

Located in `lib/actions/` - use for data mutations and fetching.

```typescript
"use server"

import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"

export async function createChat(title: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  })
  if (!session) throw new Error("Unauthorized")

  return await prisma.chat.create({
    data: {
      title,
      userId: session.user.id,
    },
  })
}
```

### Pagination Pattern

```typescript
export async function getChats(options?: {
  cursor?: string
  limit?: number
}) {
  const limit = options?.limit ?? 20
  const chats = await prisma.chat.findMany({
    take: limit + 1,
    ...(options?.cursor && {
      cursor: { id: options.cursor },
      skip: 1,
    }),
  })

  return {
    items: chats.slice(0, limit),
    nextCursor: chats.length > limit ? chats[limit].id : null,
  }
}
```

### Infinite Scroll (Client)

```typescript
import { useInView } from "react-intersection-observer"

const { ref, inView } = useInView()

useEffect(() => {
  if (inView && hasMore && !isLoadingMore) {
    loadMore()
  }
}, [inView, hasMore, isLoadingMore])

return (
  <>
    {items.map(item => <Item key={item.id} {...item} />)}
    <div ref={ref} />
  </>
)
```

## Important Notes

- **No Prettier configured** - Follow formatting conventions manually
- **Vitest in `tests/`** - Mocked at every I/O boundary; no database or secrets needed
- **MongoDB + Prisma** - Use Prisma schema, not raw MongoDB queries
- **pnpm only** - Do not use npm or yarn
- **Strict TypeScript** - All code must pass strict type checking
- **Server-first** - Prefer server components, use client only when needed
