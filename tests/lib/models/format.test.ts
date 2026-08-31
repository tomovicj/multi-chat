import { describe, expect, it } from "vitest"

import {
  formatContext,
  formatPricePerMillion,
  formatPricingSummary,
} from "@/lib/models/format"

describe("formatContext", () => {
  it("renders millions", () => {
    expect(formatContext(1_000_000)).toBe("1M")
    expect(formatContext(2_000_000)).toBe("2M")
  })

  it("gives a fraction to a non-round million", () => {
    expect(formatContext(1_500_000)).toBe("1.5M")
    expect(formatContext(1_048_576)).toBe("1.0M")
  })

  it("renders thousands, rounding to the nearest", () => {
    expect(formatContext(200_000)).toBe("200K")
    expect(formatContext(1_000)).toBe("1K")
    expect(formatContext(1_499)).toBe("1K")
    expect(formatContext(1_500)).toBe("2K")
  })

  it("leaves small numbers alone", () => {
    expect(formatContext(999)).toBe("999")
    expect(formatContext(0)).toBe("0")
  })
})

describe("formatPricePerMillion", () => {
  it("scales a per-token rate to a per-million price", () => {
    expect(formatPricePerMillion(0.000003)).toBe("$3.00")
    expect(formatPricePerMillion(0.000015)).toBe("$15.00")
  })

  it("adds precision for a rate under a cent per million", () => {
    expect(formatPricePerMillion(0.000000001)).toBe("$0.0010")
  })

  it("switches back to cents at exactly one cent per million", () => {
    expect(formatPricePerMillion(0.00000001)).toBe("$0.01")
  })

  it("renders a zero rate without the extra precision", () => {
    expect(formatPricePerMillion(0)).toBe("$0.00")
  })
})

describe("formatPricingSummary", () => {
  it("labels a free model", () => {
    expect(
      formatPricingSummary({
        promptUsdPerToken: 0,
        completionUsdPerToken: 0,
        kind: "free",
      }),
    ).toBe("Free")
  })

  it("labels a variable model rather than calling it free", () => {
    // These price at "-1" upstream: the cost depends on where they route.
    expect(
      formatPricingSummary({
        promptUsdPerToken: 0,
        completionUsdPerToken: 0,
        kind: "variable",
      }),
    ).toBe("Variable")
  })

  it("shows in / out for a paid model", () => {
    expect(
      formatPricingSummary({
        promptUsdPerToken: 0.000003,
        completionUsdPerToken: 0.000015,
        kind: "paid",
      }),
    ).toBe("$3.00 / $15.00")
  })
})
