import { beforeEach, describe, expect, it, vi } from "vitest"

const findUnique = vi.fn()
const update = vi.fn()

vi.mock("@/lib/prisma", () => ({
  default: { user: { findUnique, update } },
}))

const { deductCost, readBalanceMicros } = await import("@/lib/billing")

beforeEach(() => {
  vi.clearAllMocks()
  update.mockResolvedValue({})
})

describe("readBalanceMicros", () => {
  it("returns the stored balance untouched", async () => {
    findUnique.mockResolvedValue({ balanceMicros: 4_980_000, balanceCents: null })

    expect(await readBalanceMicros("user-1")).toBe(4_980_000)
    expect(update).not.toHaveBeenCalled()
  })

  it("scopes the read to the given user", async () => {
    findUnique.mockResolvedValue({ balanceMicros: 1, balanceCents: null })

    await readBalanceMicros("user-1")

    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-1" } }),
    )
  })

  it("returns zero for a user that does not exist", async () => {
    findUnique.mockResolvedValue(null)

    expect(await readBalanceMicros("nobody")).toBe(0)
    expect(update).not.toHaveBeenCalled()
  })

  it("returns a zero balance as-is rather than re-converting it", async () => {
    // Zero is falsy but not null: a spent-out account has already been
    // converted and must not be re-derived from `balanceCents`.
    findUnique.mockResolvedValue({ balanceMicros: 0, balanceCents: 500 })

    expect(await readBalanceMicros("user-1")).toBe(0)
    expect(update).not.toHaveBeenCalled()
  })

  it("converts a pre-micro-dollar account on first read, and writes it back", async () => {
    // Mongo applies `@default` on write, not read, so a document written
    // before `balanceMicros` existed simply has no such field.
    findUnique.mockResolvedValue({ balanceMicros: null, balanceCents: 500 })

    expect(await readBalanceMicros("user-1")).toBe(5_000_000)
    expect(update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { balanceMicros: 5_000_000 },
    })
  })

  it("converts a document with neither field to zero", async () => {
    findUnique.mockResolvedValue({ balanceMicros: null, balanceCents: null })

    expect(await readBalanceMicros("user-1")).toBe(0)
    expect(update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { balanceMicros: 0 },
    })
  })
})

describe("deductCost", () => {
  it.each([
    ["zero", 0],
    ["a negative amount", -1],
    ["a fraction", 1.5],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ])("refuses %s without touching the database", async (_label, cost) => {
    // The guard is why this is not a server action: every export of a
    // "use server" module is a POST endpoint, and a negative amount here would
    // credit the account instead of charging it.
    await expect(deductCost("user-1", cost)).rejects.toThrow(
      /Refusing to deduct a non-positive cost/,
    )

    expect(findUnique).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it("decrements the balance by the cost", async () => {
    findUnique.mockResolvedValue({ balanceMicros: 5_000_000, balanceCents: null })

    await deductCost("user-1", 1_234)

    expect(update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { balanceMicros: { decrement: 1_234 } },
    })
  })

  it("materialises the balance before decrementing it", async () => {
    // MongoDB's $inc on a missing field would create it from zero and silently
    // discard the account's pre-conversion balance, so the read has to land
    // first.
    findUnique.mockResolvedValue({ balanceMicros: null, balanceCents: 500 })

    await deductCost("user-1", 1_000)

    expect(findUnique).toHaveBeenCalledBefore(update)
    expect(update).toHaveBeenNthCalledWith(1, {
      where: { id: "user-1" },
      data: { balanceMicros: 5_000_000 },
    })
    expect(update).toHaveBeenNthCalledWith(2, {
      where: { id: "user-1" },
      data: { balanceMicros: { decrement: 1_000 } },
    })
  })

  it("allows an overdraft, since the gate runs before the turn", async () => {
    findUnique.mockResolvedValue({ balanceMicros: 10, balanceCents: null })

    await expect(deductCost("user-1", 5_000)).resolves.toBeDefined()
  })
})
