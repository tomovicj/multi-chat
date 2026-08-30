/**
 * Money helpers, in micro-dollars.
 *
 * Kept free of any database import so client components can format a balance
 * without dragging Prisma into the browser bundle.
 */

/** Micro-dollars in one US dollar. A micro is the unit the ledger stores. */
export const MICROS_PER_USD = 1_000_000;

/** Micro-dollars in one cent, for converting balances off the old ledger. */
export const MICROS_PER_CENT = 10_000;

/** Convert a USD amount, as reported by OpenRouter, to whole micro-dollars. */
export function usdToMicros(usd: number): number {
  // Round up so a turn is never free through rounding; the most this can
  // over-charge is one millionth of a dollar.
  return Math.ceil(usd * MICROS_PER_USD);
}

/**
 * Render a micro-dollar amount for display.
 *
 * Shows cents by default ("$4.98"). Amounts small enough to round to $0.00 get
 * more precision instead, so a single cheap turn does not read as free.
 */
export function formatMicros(micros: number): string {
  const usd = micros / MICROS_PER_USD;

  if (usd !== 0 && Math.abs(usd) < 0.01) {
    return `$${usd.toFixed(4)}`;
  }

  return `$${usd.toFixed(2)}`;
}
