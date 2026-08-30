"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"

import { DEFAULT_MODEL_ID } from "@/lib/models/types"

/**
 * A snapshot of the chosen model rather than a bare id.
 *
 * Carrying the label means the header renders correctly on first paint without
 * waiting for the ~400-model catalog, and a model that later disappears from
 * OpenRouter still shows its last known name instead of going blank.
 */
export type SelectedModel = {
  id: string
  name: string
  providerLabel: string
}

const DEFAULT_MODEL: SelectedModel = {
  id: DEFAULT_MODEL_ID,
  name: "GPT-4o Mini",
  providerLabel: "OpenAI",
}

const MAX_RECENTS = 5

type ModelStore = {
  selectedModel: SelectedModel
  recentIds: string[]
  setSelectedModel: (model: SelectedModel) => void
}

export const useModelStore = create<ModelStore>()(
  persist(
    (set) => ({
      selectedModel: DEFAULT_MODEL,
      recentIds: [],
      setSelectedModel: (model) =>
        set((state) => ({
          selectedModel: model,
          recentIds: [
            model.id,
            ...state.recentIds.filter((id) => id !== model.id),
          ].slice(0, MAX_RECENTS),
        })),
    }),
    {
      name: "model-selection",
      version: 2,
      migrate: (persisted, version) => {
        // v1 stored `{ selectedModel: "openai/gpt-4o-mini" }` — a bare id.
        // Without this every existing user silently loses their choice.
        if (version < 2) {
          const previous = (persisted as { selectedModel?: unknown } | null)
            ?.selectedModel

          return {
            selectedModel:
              typeof previous === "string"
                ? { id: previous, name: previous, providerLabel: "" }
                : DEFAULT_MODEL,
            recentIds: [],
          }
        }

        return persisted as { selectedModel: SelectedModel; recentIds: string[] }
      },
    },
  ),
)
