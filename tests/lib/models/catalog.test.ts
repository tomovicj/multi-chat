import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CatalogModel, ModelCatalog } from "@/lib/models/types"
import {
  OPENROUTER_MODELS_PAYLOAD,
  catalogModel,
  modelsResponse,
} from "@/tests/fixtures"

/**
 * The trimming helpers — `parsePricing`, `toCatalogModel`,
 * `collectProviderLabels` — are module-private, so everything here is driven
 * through `getModelCatalog` with a stubbed `fetch`. That also exercises the
 * parts worth trusting: zod skipping malformed rows, aliases being filtered
 * after their labels are collected, and the sort.
 *
 * `lastGood` is module state, so each case needs a fresh copy of the module.
 */
async function loadCatalog() {
  vi.resetModules()
  return import("@/lib/models/catalog")
}

function byId(catalog: ModelCatalog, id: string): CatalogModel {
  const model = catalog.models.find((entry) => entry.id === id)
  if (!model) throw new Error(`no model ${id} in the catalog`)
  return model
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.resetModules()
})

describe("getModelCatalog", () => {
  it("sends the OpenRouter key and asks for a cached response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(modelsResponse())
    vi.stubGlobal("fetch", fetchMock)

    const { getModelCatalog } = await loadCatalog()
    await getModelCatalog()

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://openrouter.ai/api/v1/models")
    expect(init.headers.Authorization).toBe("Bearer test-openrouter-key")
    expect(init.next).toEqual({ revalidate: 3600 })
  })

  it("strips the redundant provider prefix out of the name", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(modelsResponse()))

    const { getModelCatalog } = await loadCatalog()
    const model = byId(await getModelCatalog(), "anthropic/claude-opus-5")

    expect(model.name).toBe("Claude Opus 5")
    expect(model.providerLabel).toBe("Anthropic")
    expect(model.provider).toBe("anthropic")
  })

  it("keeps the first label seen for a provider slug", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(modelsResponse()))

    const { getModelCatalog } = await loadCatalog()
    const catalog = await getModelCatalog()

    // The second anthropic entry calls itself "Claude Inc"; the first wins.
    expect(byId(catalog, "anthropic/claude-haiku-4.5").providerLabel).toBe(
      "Anthropic",
    )
  })

  it("falls back to title-casing the slug when no name carries a prefix", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(modelsResponse()))

    const { getModelCatalog } = await loadCatalog()
    const model = byId(await getModelCatalog(), "z-ai/glm-4.6")

    expect(model.providerLabel).toBe("Z Ai")
    expect(model.name).toBe("GLM 4.6")
  })

  it("drops aliases, which would otherwise render as duplicate rows", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(modelsResponse()))

    const { getModelCatalog } = await loadCatalog()
    const ids = (await getModelCatalog()).models.map((model) => model.id)

    expect(ids).not.toContain("anthropic/claude-opus")
    expect(ids).not.toContain("~anthropic/claude-opus-5")
    expect(ids).toContain("anthropic/claude-opus-5")
  })

  it("skips a malformed entry instead of failing the whole catalog", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(modelsResponse()))

    const { getModelCatalog } = await loadCatalog()
    const catalog = await getModelCatalog()

    // The payload carries one row with no id.
    expect(catalog.degraded).toBe(false)
    expect(catalog.models).toHaveLength(5)
  })

  it("treats a -1 price as variable, not free", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(modelsResponse()))

    const { getModelCatalog } = await loadCatalog()
    const auto = byId(await getModelCatalog(), "openrouter/auto")

    // Calling these free would advertise paid models as costing nothing.
    expect(auto.pricing.kind).toBe("variable")
    expect(auto.pricing.promptUsdPerToken).toBe(0)
    expect(auto.pricing.completionUsdPerToken).toBe(0)
  })

  it("reads a zero price on both sides as free", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(modelsResponse()))

    const { getModelCatalog } = await loadCatalog()
    const llama = byId(
      await getModelCatalog(),
      "meta-llama/llama-3.3-70b-instruct:free",
    )

    expect(llama.pricing.kind).toBe("free")
  })

  it("carries the paid rates through", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(modelsResponse()))

    const { getModelCatalog } = await loadCatalog()
    const opus = byId(await getModelCatalog(), "anthropic/claude-opus-5")

    expect(opus.pricing).toEqual({
      promptUsdPerToken: 0.000015,
      completionUsdPerToken: 0.000075,
      kind: "paid",
    })
  })

  it("treats an unparseable price as variable rather than free", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        modelsResponse({
          data: [
            {
              id: "weird/model",
              name: "Weird: Model",
              pricing: { prompt: "not-a-number", completion: "0.1" },
            },
          ],
        }),
      ),
    )

    const { getModelCatalog } = await loadCatalog()
    const model = byId(await getModelCatalog(), "weird/model")

    expect(model.pricing.kind).toBe("variable")
  })

  it("reads capabilities off the payload", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(modelsResponse()))

    const { getModelCatalog } = await loadCatalog()
    const catalog = await getModelCatalog()
    const opus = byId(catalog, "anthropic/claude-opus-5")

    expect(opus.supportsTools).toBe(true)
    // The top-level `reasoning` block, not a sniff of supported_parameters.
    expect(opus.supportsReasoning).toBe(true)
    expect(opus.inputModalities).toEqual(["text", "image"])
    expect(opus.contextLength).toBe(200_000)

    const glm = byId(catalog, "z-ai/glm-4.6")
    expect(glm.supportsReasoning).toBe(false)
    expect(glm.inputModalities).toEqual(["text"])
  })

  it("sorts by provider label, then name", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(modelsResponse()))

    const { getModelCatalog } = await loadCatalog()
    const labelled = (await getModelCatalog()).models.map(
      (model) => `${model.providerLabel}/${model.name}`,
    )

    expect(labelled).toEqual([
      "Anthropic/Claude Haiku 4.5",
      "Anthropic/Claude Opus 5",
      "Meta/Llama 3.3 70B Instruct (free)",
      "OpenRouter/Auto Router",
      "Z Ai/GLM 4.6",
    ])
  })

  it("degrades when the payload carries no usable data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(modelsResponse({})))

    const { getModelCatalog } = await loadCatalog()
    const catalog = await getModelCatalog()

    expect(catalog).toEqual({ models: [], degraded: true })
  })

  it("serves the seed list when the request fails on a cold cache", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")))

    const { getModelCatalog } = await loadCatalog()
    const catalog = await getModelCatalog()

    expect(catalog.degraded).toBe(true)
    expect(catalog.models.length).toBeGreaterThan(0)
    expect(catalog.models.map((model) => model.id)).toContain(
      "openai/gpt-4o-mini",
    )
  })

  it("serves the seed list on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 503 })),
    )

    const { getModelCatalog } = await loadCatalog()

    expect((await getModelCatalog()).degraded).toBe(true)
  })

  it("degrades to the stale catalog rather than the seeds after one good load", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(modelsResponse())
      .mockRejectedValueOnce(new Error("network down"))
    vi.stubGlobal("fetch", fetchMock)

    const { getModelCatalog } = await loadCatalog()
    await getModelCatalog()
    const afterOutage = await getModelCatalog()

    expect(afterOutage.models.map((model) => model.id)).toContain(
      "anthropic/claude-opus-5",
    )
    // Note the caller cannot tell stale from live: `/api/chat` gates its
    // "Unknown model" rejection on this flag.
    expect(afterOutage.degraded).toBe(false)
  })

  it("does not let an empty response overwrite the last good catalog", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(modelsResponse())
      .mockResolvedValueOnce(modelsResponse({}))
      .mockRejectedValueOnce(new Error("network down"))
    vi.stubGlobal("fetch", fetchMock)

    const { getModelCatalog } = await loadCatalog()
    await getModelCatalog()
    await getModelCatalog()

    expect((await getModelCatalog()).models.map((model) => model.id)).toContain(
      "anthropic/claude-opus-5",
    )
  })
})

describe("getModel", () => {
  it("finds a model by id, and returns nothing for an unknown one", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(modelsResponse()))

    const { getModel } = await loadCatalog()

    expect((await getModel("anthropic/claude-opus-5"))?.name).toBe(
      "Claude Opus 5",
    )
    expect(await getModel("nobody/nothing")).toBeUndefined()
  })
})

describe("estimateCostUsd", () => {
  it("prices a paid turn from the live rates", async () => {
    const { estimateCostUsd } = await loadCatalog()
    const model = catalogModel({
      id: "test/paid",
      pricing: {
        promptUsdPerToken: 0.000003,
        completionUsdPerToken: 0.000015,
        kind: "paid",
      },
    })

    expect(estimateCostUsd(model, 1_000, 500)).toBeCloseTo(0.0105, 10)
  })

  it("charges nothing for a turn with no tokens", async () => {
    const { estimateCostUsd } = await loadCatalog()

    expect(estimateCostUsd(catalogModel({ id: "test/paid" }), 0, 0)).toBe(0)
  })

  it("charges nothing when the model is unknown", async () => {
    const { estimateCostUsd } = await loadCatalog()

    expect(estimateCostUsd(undefined, 1_000, 500)).toBe(0)
  })

  it.each(["free", "variable"] as const)(
    "charges nothing for a %s model",
    async (kind) => {
      const { estimateCostUsd } = await loadCatalog()
      const model = catalogModel({
        id: "test/model",
        pricing: {
          promptUsdPerToken: 0,
          completionUsdPerToken: 0,
          kind,
        },
      })

      expect(estimateCostUsd(model, 1_000, 500)).toBe(0)
    },
  )
})
