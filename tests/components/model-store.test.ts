import { afterEach, describe, expect, it, vi } from "vitest"

import { DEFAULT_MODEL_ID } from "@/lib/models/types"

const DEFAULT_MODEL = {
  id: DEFAULT_MODEL_ID,
  name: "GPT-4o Mini",
  providerLabel: "OpenAI",
}

/**
 * The store is a module singleton, so each case needs a fresh copy — and the
 * seeded storage has to be in place *before* the import, since `persist`
 * rehydrates during module evaluation.
 */
async function loadStore(persisted?: unknown) {
  vi.resetModules()
  window.localStorage.clear()

  if (persisted !== undefined) {
    window.localStorage.setItem("model-selection", JSON.stringify(persisted))
  }

  const { useModelStore } = await import("@/app/chat/_components/model-store")
  return useModelStore
}

afterEach(() => {
  window.localStorage.clear()
  vi.resetModules()
})

describe("migrating a stored selection", () => {
  it("carries a v1 bare id forward as a snapshot", async () => {
    // v1 stored `{ selectedModel: "openai/gpt-4o-mini" }`. Without the
    // migration every existing user silently loses their choice.
    const store = await loadStore({
      state: { selectedModel: "anthropic/claude-opus-5" },
      version: 1,
    })

    expect(store.getState().selectedModel).toEqual({
      id: "anthropic/claude-opus-5",
      name: "anthropic/claude-opus-5",
      providerLabel: "",
    })
    expect(store.getState().recentIds).toEqual([])
  })

  it.each([
    ["no stored selection", { state: {}, version: 1 }],
    ["a null payload", { state: null, version: 1 }],
    ["a selection of the wrong type", { state: { selectedModel: 42 }, version: 0 }],
  ])("falls back to the default for %s", async (_label, persisted) => {
    const store = await loadStore(persisted)

    expect(store.getState().selectedModel).toEqual(DEFAULT_MODEL)
  })

  it("leaves a current-version selection alone", async () => {
    const selectedModel = {
      id: "anthropic/claude-opus-5",
      name: "Claude Opus 5",
      providerLabel: "Anthropic",
    }

    const store = await loadStore({
      state: { selectedModel, recentIds: ["anthropic/claude-opus-5"] },
      version: 2,
    })

    expect(store.getState().selectedModel).toEqual(selectedModel)
    expect(store.getState().recentIds).toEqual(["anthropic/claude-opus-5"])
  })

  it("starts on the default with nothing stored", async () => {
    const store = await loadStore()

    expect(store.getState().selectedModel).toEqual(DEFAULT_MODEL)
    expect(store.getState().recentIds).toEqual([])
  })
})

describe("setSelectedModel", () => {
  it("records the whole snapshot, not just the id", async () => {
    // The label is what lets the header render correctly on first paint,
    // before the ~400-model catalog has loaded.
    const store = await loadStore()
    const model = {
      id: "anthropic/claude-opus-5",
      name: "Claude Opus 5",
      providerLabel: "Anthropic",
    }

    store.getState().setSelectedModel(model)

    expect(store.getState().selectedModel).toEqual(model)
  })

  it("puts the most recent choice first", async () => {
    const store = await loadStore()

    for (const id of ["a/one", "b/two", "c/three"]) {
      store.getState().setSelectedModel({ id, name: id, providerLabel: "" })
    }

    expect(store.getState().recentIds).toEqual(["c/three", "b/two", "a/one"])
  })

  it("moves a re-selected model to the front without duplicating it", async () => {
    const store = await loadStore()

    for (const id of ["a/one", "b/two", "a/one"]) {
      store.getState().setSelectedModel({ id, name: id, providerLabel: "" })
    }

    expect(store.getState().recentIds).toEqual(["a/one", "b/two"])
  })

  it("keeps only the five most recent", async () => {
    const store = await loadStore()

    for (let index = 0; index < 8; index += 1) {
      store
        .getState()
        .setSelectedModel({ id: `m/${index}`, name: `${index}`, providerLabel: "" })
    }

    expect(store.getState().recentIds).toEqual([
      "m/7",
      "m/6",
      "m/5",
      "m/4",
      "m/3",
    ])
  })

  it("persists the choice for the next page load", async () => {
    const store = await loadStore()
    const model = {
      id: "anthropic/claude-opus-5",
      name: "Claude Opus 5",
      providerLabel: "Anthropic",
    }

    store.getState().setSelectedModel(model)

    const written = window.localStorage.getItem("model-selection")
    expect(written).not.toBeNull()
    expect(JSON.parse(written as string)).toMatchObject({
      version: 2,
      state: { selectedModel: model },
    })
  })
})
