/**
 * Shared model-catalog types.
 *
 * Deliberately free of any server import so client components can hold and
 * render catalog entries. The fetching lives in `lib/models/catalog.ts`.
 */

export type ModelPricingKind = "paid" | "free" | "variable";

export type ModelPricing = {
  /** USD per prompt token. Zero for free and variable models. */
  promptUsdPerToken: number;
  /** USD per completion token. Zero for free and variable models. */
  completionUsdPerToken: number;
  /**
   * OpenRouter prices a handful of routing models at "-1", meaning the cost
   * depends on whichever model it routes to. Those are "variable", not free —
   * conflating the two would advertise paid models as costing nothing.
   */
  kind: ModelPricingKind;
};

export type CatalogModel = {
  /** Full OpenRouter slug, e.g. "anthropic/claude-opus-5". */
  id: string;
  /** Display name with any "Provider: " prefix stripped. */
  name: string;
  /** Grouping key taken from the id, e.g. "anthropic". */
  provider: string;
  /** Human label, e.g. "Anthropic" — prettier than the slug ("z-ai" vs "Z.ai"). */
  providerLabel: string;
  contextLength: number;
  pricing: ModelPricing;
  inputModalities: string[];
  supportsTools: boolean;
  /** True when OpenRouter advertises a reasoning/thinking block for the model. */
  supportsReasoning: boolean;
};

export type ModelCatalog = {
  models: CatalogModel[];
  /**
   * True when the live list could not be reached and a small built-in set is
   * standing in. Callers should avoid destructive decisions (like resetting a
   * user's stored model choice) while the catalog is degraded.
   */
  degraded: boolean;
};

/** Used when no model has been chosen yet, and as the degraded-catalog anchor. */
export const DEFAULT_MODEL_ID = "openai/gpt-4o-mini";
