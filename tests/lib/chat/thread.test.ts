import { describe, expect, it } from "vitest"

import { parseStoredMessages, reconcile } from "@/lib/chat/thread"
import { assistant, textOf, user } from "@/tests/fixtures"

describe("parseStoredMessages", () => {
  it("parses the JSON-encoded string every writer actually stores", () => {
    const stored = JSON.stringify([user("u1"), assistant("a1")])

    expect(parseStoredMessages(stored).map((m) => m.id)).toEqual(["u1", "a1"])
  })

  it("accepts a raw array, for rows written by hand", () => {
    const messages = [user("u1")]

    expect(parseStoredMessages(messages)).toEqual(messages)
  })

  it("does not double-parse: a doubly-encoded value yields nothing", () => {
    expect(parseStoredMessages(JSON.stringify("[]"))).toEqual([])
  })

  it("returns an empty thread rather than throwing on malformed JSON", () => {
    expect(parseStoredMessages("not json at all")).toEqual([])
  })

  it.each([
    ["a JSON number", "42"],
    ["a JSON object", '{"a":1}'],
    ["a JSON null", "null"],
  ])("returns an empty thread for %s", (_label, raw) => {
    expect(parseStoredMessages(raw)).toEqual([])
  })

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a number", 42],
    ["an object", {}],
  ])("returns an empty thread for %s", (_label, raw) => {
    expect(parseStoredMessages(raw)).toEqual([])
  })
})

describe("reconcile", () => {
  it("rejects an empty thread", () => {
    expect(reconcile([], [])).toEqual({
      ok: false,
      reason: "No messages provided",
    })
  })

  it("accepts the first message of a brand-new chat", () => {
    const first = user("u1")
    const result = reconcile([], [first])

    expect(result).toMatchObject({ ok: true, base: [] })
    expect(result.ok && result.newUserMessage?.id).toBe("u1")
  })

  it("accepts a new user message appended to the stored thread", () => {
    const stored = [user("u1"), assistant("a1")]
    const result = reconcile(stored, [...stored, user("u2")])

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.base.map((m) => m.id)).toEqual(["u1", "a1"])
    expect(result.newUserMessage?.id).toBe("u2")
  })

  it("builds `base` from the stored copies, so history cannot be rewritten", () => {
    const stored = [user("u1", "what the user really asked")]
    const tampered = [user("u1", "a version the client invented")]

    const result = reconcile(stored, [...tampered, user("u2")])

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(textOf(result.base[0])).toBe("what the user really asked")
  })

  it("strips metadata from the incoming user message", () => {
    const claimed = {
      ...user("u1"),
      metadata: { custom: { costMicros: 0, modelId: "free/model" } },
    }

    const result = reconcile([], [claimed])

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.newUserMessage?.metadata).toBeUndefined()
  })

  it("allows a shorter prefix: an edit deliberately rewrites from that point", () => {
    const stored = [user("u1"), assistant("a1"), user("u2"), assistant("a2")]
    const result = reconcile(stored, [user("u1"), user("u2-edited")])

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.base.map((m) => m.id)).toEqual(["u1"])
    expect(result.newUserMessage?.id).toBe("u2-edited")
  })

  it("reports no new message when the thread is resent for a regenerate", () => {
    const stored = [user("u1"), assistant("a1")]
    const result = reconcile(stored, [user("u1")])

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.newUserMessage).toBeNull()
    expect(result.base.map((m) => m.id)).toEqual(["u1"])
  })

  it("rejects a thread longer than the stored history", () => {
    const stored = [user("u1")]
    // The trailing message is a new user turn, so the role check passes and
    // the length check is what rejects this.
    const received = [user("u1"), assistant("a1"), user("u2")]

    expect(reconcile(stored, received)).toEqual({
      ok: false,
      reason: "Thread is longer than the stored history",
    })
  })

  it("rejects divergence: a different id where the server has its own", () => {
    const stored = [user("u1"), assistant("a1"), user("u2")]
    const received = [user("u1"), assistant("somewhere-else"), user("u2")]

    expect(reconcile(stored, received)).toEqual({
      ok: false,
      reason: "Thread has diverged from the stored history",
    })
  })

  it("rejects a trailing new message that is not from the user", () => {
    expect(reconcile([user("u1")], [user("u1"), assistant("a1")])).toEqual({
      ok: false,
      reason: "The trailing new message must be from the user",
    })
  })

  it("rejects divergence even when the ids exist out of order", () => {
    const stored = [user("u1"), assistant("a1"), user("u2")]
    // "u2" is known, so this is read as a resend rather than a new message —
    // and then fails the positional check against "a1".
    const received = [user("u1"), user("u2")]

    expect(reconcile(stored, received)).toEqual({
      ok: false,
      reason: "Thread has diverged from the stored history",
    })
  })

  it("still truncates for a stale second tab — the documented limitation", () => {
    // A tab that never saw the second turn sends a prefix plus a new message,
    // which is indistinguishable from an edit. Pinned so that fixing it later
    // is a deliberate change rather than a surprise.
    const stored = [user("u1"), assistant("a1"), user("u2"), assistant("a2")]
    const staleTab = [user("u1"), assistant("a1"), user("u3-from-stale-tab")]

    const result = reconcile(stored, staleTab)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.base.map((m) => m.id)).toEqual(["u1", "a1"])
  })
})
