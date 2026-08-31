import type { ChatUIMessage } from "@/lib/chat/message-metadata"
import type { CatalogModel, ModelPricing } from "@/lib/models/types"

/** A `ChatUIMessage` with a single text part. */
export function message(
  id: string,
  role: "user" | "assistant",
  text = `text of ${id}`,
): ChatUIMessage {
  return { id, role, parts: [{ type: "text", text }] }
}

export const user = (id: string, text?: string) => message(id, "user", text)
export const assistant = (id: string, text?: string) =>
  message(id, "assistant", text)

/** The text of every text part, joined — mirrors the route's own accessor. */
export function textOf(msg: ChatUIMessage): string {
  return msg.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("")
}

export function catalogModel(
  overrides: Partial<CatalogModel> & { id: string },
): CatalogModel {
  const pricing: ModelPricing = overrides.pricing ?? {
    promptUsdPerToken: 0.000003,
    completionUsdPerToken: 0.000015,
    kind: "paid",
  }

  return {
    name: "Test Model",
    provider: overrides.id.split("/")[0],
    providerLabel: "Test",
    contextLength: 128_000,
    inputModalities: ["text"],
    supportsTools: false,
    supportsReasoning: false,
    ...overrides,
    pricing,
  }
}

/**
 * A stand-in for OpenRouter's `/api/v1/models` payload, carrying the traps the
 * real one does: a `"Provider: "` name prefix, an alias by `alias_target` and
 * another by a `~` id, a `"-1"` (variable) price, a free model, a row that
 * fails the schema, and a provider with no prefix anywhere so the label has to
 * fall back to title-casing the slug.
 */
export const OPENROUTER_MODELS_PAYLOAD = {
  data: [
    {
      id: "anthropic/claude-opus-5",
      name: "Anthropic: Claude Opus 5",
      context_length: 200_000,
      pricing: { prompt: "0.000015", completion: "0.000075" },
      architecture: { input_modalities: ["text", "image"] },
      supported_parameters: ["tools", "reasoning"],
      reasoning: { enabled: true },
    },
    {
      // Same provider slug, a different prefix: first seen must win.
      id: "anthropic/claude-haiku-4.5",
      name: "Claude Inc: Claude Haiku 4.5",
      context_length: 200_000,
      pricing: { prompt: "0.000001", completion: "0.000005" },
    },
    {
      // "-1" means the price depends on where the request is routed.
      id: "openrouter/auto",
      name: "OpenRouter: Auto Router",
      context_length: 2_000_000,
      pricing: { prompt: "-1", completion: "-1" },
    },
    {
      id: "meta-llama/llama-3.3-70b-instruct:free",
      name: "Meta: Llama 3.3 70B Instruct (free)",
      context_length: 128_000,
      pricing: { prompt: "0", completion: "0" },
    },
    {
      // No "Provider: " prefix anywhere for this slug -> title-cased slug.
      id: "z-ai/glm-4.6",
      name: "GLM 4.6",
      context_length: 200_000,
      pricing: { prompt: "0.0000006", completion: "0.0000022" },
    },
    {
      // An alias of the first entry; would render as a duplicate row.
      id: "anthropic/claude-opus",
      name: "Anthropic: Claude Opus 5",
      alias_target: "anthropic/claude-opus-5",
      pricing: { prompt: "0.000015", completion: "0.000075" },
    },
    {
      // The other alias shape.
      id: "~anthropic/claude-opus-5",
      name: "Anthropic: Claude Opus 5 (alias)",
      pricing: { prompt: "0.000015", completion: "0.000075" },
    },
    {
      // No id: fails `rawModelSchema` and must be skipped, not fatal.
      name: "Broken: No Id",
      pricing: { prompt: "0.000001", completion: "0.000001" },
    },
  ],
}

/** A `Response` carrying the payload, for stubbing `fetch`. */
export function modelsResponse(body: unknown = OPENROUTER_MODELS_PAYLOAD) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}
