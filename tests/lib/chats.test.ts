import { beforeEach, describe, expect, it, vi } from "vitest"

import { parseStoredMessages } from "@/lib/chat/thread"
import { assistant, user } from "@/tests/fixtures"

const create = vi.fn()
const update = vi.fn()

vi.mock("@/lib/prisma", () => ({
  default: { chat: { create, update } },
}))

const { createChatRow, saveChatMessages } = await import("@/lib/chats")

beforeEach(() => {
  vi.clearAllMocks()
  create.mockResolvedValue({})
  update.mockResolvedValue({})
})

describe("createChatRow", () => {
  it("stores the thread as a JSON string, which parseStoredMessages reads back", async () => {
    const thread = [user("u1"), assistant("a1")]

    await createChatRow("chat-1", "user-1", "A title", thread, "openai/gpt-4o-mini")

    const { data } = create.mock.calls[0][0]
    expect(typeof data.messages).toBe("string")
    expect(parseStoredMessages(data.messages)).toEqual(thread)
  })

  it("records the id, owner, title and model", async () => {
    await createChatRow("chat-1", "user-1", "A title", [], "openai/gpt-4o-mini")

    expect(create.mock.calls[0][0].data).toMatchObject({
      id: "chat-1",
      userId: "user-1",
      title: "A title",
      model: "openai/gpt-4o-mini",
    })
  })
})

describe("saveChatMessages", () => {
  it("scopes the write by owner, which is the authorization check", async () => {
    await saveChatMessages("chat-1", "user-1", [user("u1")], "openai/gpt-4o-mini")

    expect(update.mock.calls[0][0].where).toEqual({
      id: "chat-1",
      userId: "user-1",
    })
  })

  it("round-trips the thread and touches updatedAt", async () => {
    const thread = [user("u1"), assistant("a1"), user("u2")]

    await saveChatMessages("chat-1", "user-1", thread, null)

    const { data } = update.mock.calls[0][0]
    expect(parseStoredMessages(data.messages)).toEqual(thread)
    expect(data.model).toBeNull()
    expect(data.updatedAt).toBeInstanceOf(Date)
  })
})
