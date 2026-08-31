import { beforeEach, describe, expect, it, vi } from "vitest"
import { MockLanguageModelV3, simulateReadableStream } from "ai/test"

import { assistant, catalogModel, user } from "@/tests/fixtures"

/**
 * The stream-part union, derived from the mock rather than imported: it lives
 * in `@ai-sdk/provider`, which is only a transitive dependency here.
 */
type StreamChunk =
  Awaited<ReturnType<MockLanguageModelV3["doStream"]>>["stream"] extends
    ReadableStream<infer Part>
    ? Part
    : never

const getSession = vi.fn()
const findUnique = vi.fn()
const readBalanceMicros = vi.fn()
const deductCost = vi.fn()
const createChatRow = vi.fn()
const saveChatMessages = vi.fn()
const getModelCatalog = vi.fn()

/** Set per-test; `createOpenRouter` hands this back as the language model. */
let languageModel: MockLanguageModelV3

vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
vi.mock("@/lib/auth", () => ({ default: { api: { getSession } } }))
vi.mock("@/lib/prisma", () => ({ default: { chat: { findUnique } } }))
vi.mock("@/lib/billing", () => ({ readBalanceMicros, deductCost }))
vi.mock("@/lib/chats", () => ({ createChatRow, saveChatMessages }))
vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: () => ({ chat: () => languageModel }),
}))
vi.mock("@/lib/models/catalog", async (importOriginal) => {
  // `estimateCostUsd` is pure and part of what is under test here — only the
  // network-backed catalog is stubbed.
  const actual = await importOriginal<typeof import("@/lib/models/catalog")>()
  return { ...actual, getModelCatalog }
})

const { POST } = await import("@/app/api/chat/route")

const MODEL_ID = "anthropic/claude-opus-5"

const MODEL = catalogModel({
  id: MODEL_ID,
  name: "Claude Opus 5",
  providerLabel: "Anthropic",
  pricing: {
    promptUsdPerToken: 0.000015,
    completionUsdPerToken: 0.000075,
    kind: "paid",
  },
})

/** A stream that answers "Hello", optionally reporting a cost like OpenRouter. */
function replyStream({ cost }: { cost?: number } = {}) {
  const finish: Extract<StreamChunk, { type: "finish" }> = {
    type: "finish",
    finishReason: { unified: "stop", raw: "stop" },
    // The provider-level shape is nested; the UI stream flattens it back into
    // the `usage.inputTokens` number the route reads.
    usage: {
      inputTokens: { total: 1_000, noCache: 1_000, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 500, text: 500, reasoning: 0 },
    },
    // Absent for a free model, or a provider that reports no cost of its own.
    providerMetadata:
      cost === undefined ? undefined : { openrouter: { usage: { cost } } },
  }

  const chunks: StreamChunk[] = [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "0" },
    { type: "text-delta", id: "0", delta: "Hello" },
    { type: "text-end", id: "0" },
    finish,
  ]

  return new MockLanguageModelV3({
    doStream: async () => ({ stream: simulateReadableStream({ chunks }) }),
  })
}

function post(body: unknown) {
  return POST(
    new Request("http://localhost:3000/api/chat", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
  )
}

const NEW_CHAT = {
  chatId: "chat-1",
  modelId: MODEL_ID,
  messages: [user("u1", "Hi there")],
}

beforeEach(() => {
  vi.clearAllMocks()
  languageModel = replyStream({ cost: 0.0123 })
  getSession.mockResolvedValue({ user: { id: "user-1" } })
  findUnique.mockResolvedValue(null)
  readBalanceMicros.mockResolvedValue(5_000_000)
  createChatRow.mockResolvedValue({})
  saveChatMessages.mockResolvedValue({})
  getModelCatalog.mockResolvedValue({ models: [MODEL], degraded: false })
})

describe("POST /api/chat — refusals", () => {
  it("refuses without a session", async () => {
    getSession.mockResolvedValue(null)

    const response = await post(NEW_CHAT)

    expect(response.status).toBe(401)
    expect(readBalanceMicros).not.toHaveBeenCalled()
  })

  it.each([
    ["no messages", { ...NEW_CHAT, messages: [] }],
    ["a non-array", { ...NEW_CHAT, messages: "nope" }],
  ])("rejects %s", async (_label, body) => {
    const response = await post(body)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "No messages provided",
    })
  })

  it("rejects a request with no chat id", async () => {
    const response = await post({ ...NEW_CHAT, chatId: "" })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "No chatId provided",
    })
  })

  it("refuses an empty balance with 402 before spending anything", async () => {
    readBalanceMicros.mockResolvedValue(0)

    const response = await post(NEW_CHAT)

    expect(response.status).toBe(402)
    expect(createChatRow).not.toHaveBeenCalled()
  })

  it("answers 404 for someone else's chat, so ids cannot be probed", async () => {
    findUnique.mockResolvedValue({ userId: "someone-else", messages: "[]" })

    const response = await post(NEW_CHAT)

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: "Chat not found" })
  })

  it("answers 409 with the reconciliation's own reason", async () => {
    findUnique.mockResolvedValue({
      userId: "user-1",
      messages: JSON.stringify([user("u1"), assistant("a1"), user("u2")]),
    })

    // "u2" is a known id, so this reads as a resend rather than an edit — and
    // then fails the positional check against "a1".
    const response = await post({
      ...NEW_CHAT,
      messages: [user("u1"), assistant("somewhere-else"), user("u2")],
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: "Thread has diverged from the stored history",
    })
    expect(saveChatMessages).not.toHaveBeenCalled()
  })

  it("rejects a model the catalog does not know", async () => {
    const response = await post({ ...NEW_CHAT, modelId: "nobody/nothing" })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "Unknown model: nobody/nothing",
    })
  })

  it("rejects nothing while the catalog is degraded", async () => {
    // A bad id is indistinguishable from a list we failed to load.
    getModelCatalog.mockResolvedValue({ models: [], degraded: true })

    const response = await post({ ...NEW_CHAT, modelId: "nobody/nothing" })

    expect(response.status).toBe(200)
  })
})

describe("POST /api/chat — answering", () => {
  it("streams a reply", async () => {
    const response = await post(NEW_CHAT)

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/event-stream")
    await expect(response.text()).resolves.toContain("Hello")
  })

  it("creates the chat before streaming, so a dead stream keeps the question", async () => {
    const response = await post(NEW_CHAT)

    expect(createChatRow).toHaveBeenCalledTimes(1)
    expect(saveChatMessages).not.toHaveBeenCalled()

    await response.text()

    // And again once the reply is complete.
    expect(saveChatMessages).toHaveBeenCalledTimes(1)
  })

  it("titles a new chat from the first user message", async () => {
    await (await post(NEW_CHAT)).text()

    expect(createChatRow).toHaveBeenCalledWith(
      "chat-1",
      "user-1",
      "Hi there",
      expect.any(Array),
      MODEL_ID,
    )
  })

  it("truncates a long title to fifty characters", async () => {
    await (
      await post({ ...NEW_CHAT, messages: [user("u1", "x".repeat(80))] })
    ).text()

    const title = createChatRow.mock.calls[0][2] as string
    expect(title).toHaveLength(50)
    expect(title.endsWith("...")).toBe(true)
  })

  it("updates rather than creates when the chat already exists", async () => {
    findUnique.mockResolvedValue({
      userId: "user-1",
      messages: JSON.stringify([user("u1")]),
    })

    await (
      await post({ ...NEW_CHAT, messages: [user("u1"), user("u2")] })
    ).text()

    expect(createChatRow).not.toHaveBeenCalled()
    expect(saveChatMessages).toHaveBeenCalledTimes(2)
  })

  it("sends the stored copies to the model, not the client's version", async () => {
    findUnique.mockResolvedValue({
      userId: "user-1",
      messages: JSON.stringify([user("u1", "what was really asked")]),
    })

    await (
      await post({
        ...NEW_CHAT,
        messages: [user("u1", "a version the client invented"), user("u2", "and now this")],
      })
    ).text()

    const prompt = languageModel.doStreamCalls[0].prompt
    expect(JSON.stringify(prompt)).toContain("what was really asked")
    expect(JSON.stringify(prompt)).not.toContain("a version the client invented")
  })

  it("attributes the reply to the model that wrote it", async () => {
    const body = await (await post(NEW_CHAT)).text()

    expect(body).toContain(MODEL_ID)
    expect(body).toContain("Claude Opus 5")
    expect(body).toContain("Anthropic")
  })
})

describe("POST /api/chat — charging", () => {
  it("charges what OpenRouter says the turn cost", async () => {
    languageModel = replyStream({ cost: 0.0123 })

    await (await post(NEW_CHAT)).text()

    expect(deductCost).toHaveBeenCalledWith("user-1", 12_300)
  })

  it("rounds a fractional micro up, so a turn is never free", async () => {
    languageModel = replyStream({ cost: 0.00000005 })

    await (await post(NEW_CHAT)).text()

    expect(deductCost).toHaveBeenCalledWith("user-1", 1)
  })

  it("prices the turn from the catalog when no cost is reported", async () => {
    languageModel = replyStream()

    await (await post(NEW_CHAT)).text()

    // 1000 prompt tokens at $0.000015 + 500 completion at $0.000075.
    expect(deductCost).toHaveBeenCalledWith("user-1", 52_500)
  })

  it("charges nothing for a free model with no reported cost", async () => {
    languageModel = replyStream()
    getModelCatalog.mockResolvedValue({
      models: [
        catalogModel({
          id: MODEL_ID,
          pricing: {
            promptUsdPerToken: 0,
            completionUsdPerToken: 0,
            kind: "free",
          },
        }),
      ],
      degraded: false,
    })

    await (await post(NEW_CHAT)).text()

    expect(deductCost).not.toHaveBeenCalled()
  })

  it("still saves the thread when charging fails", async () => {
    deductCost.mockRejectedValue(new Error("ledger unavailable"))

    const response = await post(NEW_CHAT)

    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toContain("Hello")
  })
})
