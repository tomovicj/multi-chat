import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.fn()
const findMany = vi.fn()
const findUnique = vi.fn()
const update = vi.fn()
const del = vi.fn()

vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
vi.mock("@/lib/auth", () => ({ default: { api: { getSession } } }))
vi.mock("@/lib/prisma", () => ({
  default: { chat: { findMany, findUnique, update, delete: del } },
}))

const { deleteChat, getChatById, getChats, renameChat } = await import(
  "@/lib/actions/chat"
)

const SESSION = { user: { id: "user-1" } }

/** `limit + 1` rows, so the action sees one more than a page. */
function chatRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `chat-${index}`,
    title: `Chat ${index}`,
    createdAt: new Date(2026, 0, count - index),
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  getSession.mockResolvedValue(SESSION)
  findMany.mockResolvedValue([])
  update.mockResolvedValue({})
  del.mockResolvedValue({})
})

describe("without a session", () => {
  beforeEach(() => {
    getSession.mockResolvedValue(null)
  })

  it.each([
    ["getChats", () => getChats()],
    ["renameChat", () => renameChat("chat-1", "New title")],
    ["deleteChat", () => deleteChat("chat-1")],
    ["getChatById", () => getChatById("chat-1")],
  ])("%s refuses and never reaches the database", async (_name, call) => {
    await expect(call()).rejects.toThrow("Unauthorized")

    expect(findMany).not.toHaveBeenCalled()
    expect(findUnique).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(del).not.toHaveBeenCalled()
  })
})

describe("getChats", () => {
  it("scopes the query to the session's user", async () => {
    await getChats()

    expect(findMany.mock.calls[0][0].where).toEqual({ userId: "user-1" })
  })

  it("asks for one row more than a page, to know whether more exist", async () => {
    await getChats({ limit: 5 })

    expect(findMany.mock.calls[0][0].take).toBe(6)
  })

  it("trims the extra row and hands back a cursor", async () => {
    findMany.mockResolvedValue(chatRows(21))

    const result = await getChats()

    expect(result.chats).toHaveLength(20)
    expect(result.hasMore).toBe(true)
    expect(result.nextCursor).toBe("chat-19")
  })

  it("reports the end of the list when a page is not full", async () => {
    findMany.mockResolvedValue(chatRows(3))

    const result = await getChats()

    expect(result.chats).toHaveLength(3)
    expect(result.hasMore).toBe(false)
    expect(result.nextCursor).toBeNull()
  })

  it("skips the cursor row itself when paginating", async () => {
    await getChats({ cursor: "chat-19" })

    expect(findMany.mock.calls[0][0]).toMatchObject({
      skip: 1,
      cursor: { id: "chat-19" },
    })
  })

  it("does not skip anything on the first page", async () => {
    await getChats()

    expect(findMany.mock.calls[0][0].skip).toBeUndefined()
  })

  it("filters by title, case-insensitively, when given a query", async () => {
    await getChats({ query: "  Prisma  " })

    expect(findMany.mock.calls[0][0].where).toEqual({
      userId: "user-1",
      title: { contains: "Prisma", mode: "insensitive" },
    })
  })

  it.each([["", "an empty query"], ["   ", "a blank query"]])(
    "adds no title filter for %s",
    async (query) => {
      await getChats({ query })

      expect(findMany.mock.calls[0][0].where).toEqual({ userId: "user-1" })
    },
  )

  it("returns the newest chats first", async () => {
    await getChats()

    expect(findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: "desc" })
  })
})

describe("renameChat", () => {
  it("trims the title and scopes the write by owner", async () => {
    await renameChat("chat-1", "  Renamed  ")

    expect(update).toHaveBeenCalledWith({
      where: { id: "chat-1", userId: "user-1" },
      data: { title: "Renamed" },
    })
  })

  it("caps a long title at 120 characters", async () => {
    await renameChat("chat-1", "x".repeat(200))

    expect(update.mock.calls[0][0].data.title).toHaveLength(120)
  })

  it.each([
    ["an empty title", ""],
    ["whitespace only", "   \n\t "],
  ])("refuses %s", async (_label, title) => {
    await expect(renameChat("chat-1", title)).rejects.toThrow("Title required")
    expect(update).not.toHaveBeenCalled()
  })

  it.each([
    ["a non-string title", "chat-1", 42],
    ["a non-string id", 42, "A title"],
  ])("refuses %s, since the arguments are hostile", async (_label, id, title) => {
    // Every export of a "use server" module is a POST endpoint anyone can call
    // with arguments of their choosing.
    await expect(
      renameChat(id as string, title as string),
    ).rejects.toThrow("Invalid input")

    expect(update).not.toHaveBeenCalled()
  })
})

describe("deleteChat", () => {
  it("scopes the delete by owner", async () => {
    await deleteChat("chat-1")

    expect(del).toHaveBeenCalledWith({
      where: { id: "chat-1", userId: "user-1" },
    })
  })
})

describe("getChatById", () => {
  it("scopes the read by owner", async () => {
    findUnique.mockResolvedValue({ id: "chat-1", title: "A chat" })

    await getChatById("chat-1")

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "chat-1", userId: "user-1" },
    })
  })

  it("refuses a chat this user does not own, same as a missing one", async () => {
    findUnique.mockResolvedValue(null)

    await expect(getChatById("someone-elses")).rejects.toThrow("Chat not found")
  })
})
