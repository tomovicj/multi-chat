import type { ChatUIMessage } from "@/lib/chat/message-metadata"

/**
 * Read the stored thread.
 *
 * `Chat.messages` is a Prisma `Json` column, but every write stringifies, so
 * the stored value is a JSON-encoded string rather than an array. Old rows and
 * hand-edited rows can be either, and neither should take a request down.
 */
export function parseStoredMessages(raw: unknown): ChatUIMessage[] {
  let value = raw

  if (typeof value === "string") {
    try {
      value = JSON.parse(value)
    } catch {
      return []
    }
  }

  return Array.isArray(value) ? (value as ChatUIMessage[]) : []
}

export type Reconciliation =
  | { ok: true; base: ChatUIMessage[]; newUserMessage: ChatUIMessage | null }
  | { ok: false; reason: string }

/**
 * Check the client's view of a thread against what is stored.
 *
 * The client may send a prefix of the stored thread, optionally with one new
 * trailing user message. A *shorter* prefix is an edit or a regenerate, which
 * deliberately rewrites history from that point — that is the product
 * behaviour. What is rejected is divergence: an id in a position where the
 * server has a different one, meaning the two views have drifted apart and
 * writing the client's version would destroy messages it cannot see.
 *
 * `base` comes from the *stored* messages rather than the client's copies, so
 * the text of past turns cannot be rewritten by editing the request body.
 *
 * Known limitation: a stale second tab sending a new message looks exactly like
 * an edit — both arrive as "here is a prefix plus one new message" — so it will
 * still truncate. Distinguishing them needs the client to report the head it
 * believed in, or a branching store that never deletes.
 */
export function reconcile(
  stored: ChatUIMessage[],
  received: ChatUIMessage[],
): Reconciliation {
  if (received.length === 0) {
    return { ok: false, reason: "No messages provided" }
  }

  const last = received[received.length - 1]
  const storedIds = new Set(stored.map((message) => message.id))
  const isNewMessage = !storedIds.has(last.id)

  if (isNewMessage && last.role !== "user") {
    return { ok: false, reason: "The trailing new message must be from the user" }
  }

  const head = isNewMessage ? received.slice(0, -1) : received

  if (head.length > stored.length) {
    return { ok: false, reason: "Thread is longer than the stored history" }
  }

  for (let index = 0; index < head.length; index += 1) {
    if (head[index].id !== stored[index].id) {
      return { ok: false, reason: "Thread has diverged from the stored history" }
    }
  }

  return {
    ok: true,
    base: stored.slice(0, head.length),
    // Metadata is attribution the server writes; anything the client sent on
    // its own message is dropped rather than persisted as though we had.
    newUserMessage: isNewMessage ? { ...last, metadata: undefined } : null,
  }
}
