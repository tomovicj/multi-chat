import { z } from "zod";

import {
  DEFAULT_MODEL_ID,
  type CatalogModel,
  type ModelCatalog,
  type ModelPricing,
} from "@/lib/models/types";

/**
 * The live OpenRouter model catalog.
 *
 * Server-only by convention, like `lib/billing.ts`: it reads the API key and is
 * imported solely by `app/api/models/route.ts`. Do not import it from a client
 * component.
 *
 * The provider package ships no model-listing helper, so this calls the REST
 * endpoint directly. The response is ~650 KB across ~400 models, which is why
 * `toCatalogModel` keeps only the fields the picker actually renders.
 */

const MODELS_URL = "https://openrouter.ai/api/v1/models";
const REVALIDATE_SECONDS = 3600;

/** Only the fields we use; everything else on the payload is ignored. */
const rawModelSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  context_length: z.number().nullish(),
  alias_target: z.string().nullish(),
  pricing: z
    .object({
      prompt: z.string().optional(),
      completion: z.string().optional(),
    })
    .optional(),
  architecture: z
    .object({
      input_modalities: z.array(z.string()).optional(),
    })
    .optional(),
  supported_parameters: z.array(z.string()).optional(),
  reasoning: z.unknown().optional(),
});

type RawModel = z.infer<typeof rawModelSchema>;

/**
 * Stand-in list served when OpenRouter cannot be reached on a cold cache, so
 * the picker shows something usable rather than nothing.
 */
const SEED_MODELS: CatalogModel[] = [
  seed("openai/gpt-4o-mini", "GPT-4o Mini", "openai", "OpenAI", 128_000),
  seed("openai/gpt-4o", "GPT-4o", "openai", "OpenAI", 128_000),
  seed("anthropic/claude-sonnet-4.5", "Claude Sonnet 4.5", "anthropic", "Anthropic", 200_000),
  seed("google/gemini-2.0-flash-001", "Gemini 2.0 Flash", "google", "Google", 1_000_000),
  seed("meta-llama/llama-3.3-70b-instruct", "Llama 3.3 70B", "meta-llama", "Meta", 128_000),
];

function seed(
  id: string,
  name: string,
  provider: string,
  providerLabel: string,
  contextLength: number,
): CatalogModel {
  return {
    id,
    name,
    provider,
    providerLabel,
    contextLength,
    pricing: { promptUsdPerToken: 0, completionUsdPerToken: 0, kind: "variable" },
    inputModalities: ["text"],
    supportsTools: false,
    supportsReasoning: false,
  };
}

function parsePricing(raw: RawModel): ModelPricing {
  const prompt = Number(raw.pricing?.prompt ?? "0");
  const completion = Number(raw.pricing?.completion ?? "0");

  // "-1" means the price depends on where the request is routed.
  if (prompt < 0 || completion < 0) {
    return { promptUsdPerToken: 0, completionUsdPerToken: 0, kind: "variable" };
  }

  if (!Number.isFinite(prompt) || !Number.isFinite(completion)) {
    return { promptUsdPerToken: 0, completionUsdPerToken: 0, kind: "variable" };
  }

  if (prompt === 0 && completion === 0) {
    return { promptUsdPerToken: 0, completionUsdPerToken: 0, kind: "free" };
  }

  return { promptUsdPerToken: prompt, completionUsdPerToken: completion, kind: "paid" };
}

/** "anthropic" -> "Anthropic", used only when a name carries no label prefix. */
function titleCaseSlug(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function toCatalogModel(raw: RawModel, providerLabels: Map<string, string>): CatalogModel {
  const provider = raw.id.split("/")[0] ?? raw.id;
  const rawName = raw.name ?? raw.id;
  const separator = rawName.indexOf(": ");

  return {
    id: raw.id,
    // Names arrive as "Anthropic: Claude Opus 5"; the provider is shown
    // separately, so strip the redundant prefix.
    name: separator === -1 ? rawName : rawName.slice(separator + 2),
    provider,
    providerLabel: providerLabels.get(provider) ?? titleCaseSlug(provider),
    contextLength: raw.context_length ?? 0,
    pricing: parsePricing(raw),
    inputModalities: raw.architecture?.input_modalities ?? ["text"],
    supportsTools: raw.supported_parameters?.includes("tools") ?? false,
    // The top-level `reasoning` block is a far better signal than sniffing
    // supported_parameters: OpenRouter sets it on every thinking model.
    supportsReasoning: raw.reasoning != null,
  };
}

/**
 * Build slug -> pretty label from the name prefixes, which are nicer than the
 * slugs themselves ("Z.ai" rather than "z-ai"). Most entries carry one; the
 * first seen for a slug wins.
 */
function collectProviderLabels(entries: RawModel[]): Map<string, string> {
  const labels = new Map<string, string>();

  for (const entry of entries) {
    const provider = entry.id.split("/")[0];
    const separator = entry.name?.indexOf(": ") ?? -1;

    if (!provider || labels.has(provider) || separator === -1) continue;

    labels.set(provider, entry.name!.slice(0, separator));
  }

  return labels;
}

async function fetchCatalog(): Promise<ModelCatalog> {
  const response = await fetch(MODELS_URL, {
    headers: process.env.OPENROUTER_API_KEY
      ? { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` }
      : undefined,
    next: { revalidate: REVALIDATE_SECONDS },
  });

  if (!response.ok) {
    throw new Error(`OpenRouter models request failed: ${response.status}`);
  }

  const body = (await response.json()) as { data?: unknown };
  const entries = Array.isArray(body.data) ? body.data : [];

  const parsed: RawModel[] = [];

  for (const entry of entries) {
    const result = rawModelSchema.safeParse(entry);
    // Skip malformed entries rather than failing the whole catalog.
    if (result.success) parsed.push(result.data);
  }

  const labels = collectProviderLabels(parsed);

  const models = parsed
    // Aliases point at another entry and would show as duplicate rows.
    .filter((raw) => !raw.alias_target && !raw.id.startsWith("~"))
    .map((raw) => toCatalogModel(raw, labels))
    .sort(
      (a, b) =>
        a.providerLabel.localeCompare(b.providerLabel) || a.name.localeCompare(b.name),
    );

  return { models, degraded: models.length === 0 };
}

/** Last successful catalog, so a later outage degrades to stale rather than seed. */
let lastGood: ModelCatalog | null = null;

export async function getModelCatalog(): Promise<ModelCatalog> {
  try {
    const catalog = await fetchCatalog();
    if (!catalog.degraded) lastGood = catalog;
    return catalog;
  } catch (error) {
    console.error("Failed to load the OpenRouter model catalog:", error);
    return lastGood ?? { models: SEED_MODELS, degraded: true };
  }
}

export async function getModel(id: string): Promise<CatalogModel | undefined> {
  const { models } = await getModelCatalog();
  return models.find((model) => model.id === id);
}

/**
 * Price a turn from the catalog, in USD.
 *
 * Used only when OpenRouter reports no cost of its own. Unlike the hardcoded
 * table this replaces, the rates here are the live ones.
 */
export function estimateCostUsd(
  model: CatalogModel | undefined,
  inputTokens: number,
  outputTokens: number,
): number {
  if (!model || model.pricing.kind !== "paid") return 0;

  return (
    inputTokens * model.pricing.promptUsdPerToken +
    outputTokens * model.pricing.completionUsdPerToken
  );
}

export { DEFAULT_MODEL_ID };
