import { describe, expect, it } from "vitest"

import { MICROS_PER_CENT, MICROS_PER_USD, formatMicros, usdToMicros } from "@/lib/money"

describe("usdToMicros", () => {
  it("converts whole dollars", () => {
    expect(usdToMicros(5)).toBe(5_000_000)
    expect(usdToMicros(0)).toBe(0)
  })

  it("rounds up, so a turn is never free through rounding", () => {
    // A tenth of a micro-dollar still costs one.
    expect(usdToMicros(0.0000001)).toBe(1)
    expect(usdToMicros(0.0000011)).toBe(2)
  })

  it("charges a real cheap turn rather than rounding it away", () => {
    // ~0.02c, the case whole cents could not represent.
    expect(usdToMicros(0.0002)).toBe(200)
  })

  it("is exact on the unit boundary", () => {
    expect(usdToMicros(1 / MICROS_PER_USD)).toBe(1)
  })
})

describe("formatMicros", () => {
  it("shows cents for ordinary balances", () => {
    expect(formatMicros(4_980_000)).toBe("$4.98")
    expect(formatMicros(5_000_000)).toBe("$5.00")
  })

  it("shows zero as a plain $0.00", () => {
    expect(formatMicros(0)).toBe("$0.00")
  })

  it("adds precision below a cent, so a cheap turn does not read as free", () => {
    expect(formatMicros(5_000)).toBe("$0.0050")
    expect(formatMicros(1_234)).toBe("$0.0012")
  })

  it("switches back to cents at exactly one cent", () => {
    // The branch is `< 0.01`, not `<=`.
    expect(formatMicros(MICROS_PER_CENT)).toBe("$0.01")
    expect(formatMicros(MICROS_PER_CENT - 1)).toBe("$0.0100")
  })

  it("renders a negative balance from an overdrawn turn", () => {
    expect(formatMicros(-2_000_000)).toBe("$-2.00")
  })
})

describe("the unit constants", () => {
  it("relates cents to micros by a factor of 100", () => {
    expect(MICROS_PER_USD).toBe(100 * MICROS_PER_CENT)
  })
})
