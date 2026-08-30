/** Client-safe formatting helpers for catalog values. */

import type { ModelPricing } from "@/lib/models/types";

/** 200000 -> "200K", 1000000 -> "1M". */
export function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) {
    const millions = tokens / 1_000_000;
    return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`;
  }

  if (tokens >= 1_000) {
    return `${Math.round(tokens / 1_000)}K`;
  }

  return String(tokens);
}

/** Per-token USD -> a per-million-token price like "$3.00". */
export function formatPricePerMillion(usdPerToken: number): string {
  const perMillion = usdPerToken * 1_000_000;

  if (perMillion > 0 && perMillion < 0.01) {
    return `$${perMillion.toFixed(4)}`;
  }

  return `$${perMillion.toFixed(2)}`;
}

/** Short "in / out per 1M" summary for a picker row. */
export function formatPricingSummary(pricing: ModelPricing): string {
  if (pricing.kind === "free") return "Free";
  if (pricing.kind === "variable") return "Variable";

  return `${formatPricePerMillion(pricing.promptUsdPerToken)} / ${formatPricePerMillion(
    pricing.completionUsdPerToken,
  )}`;
}
