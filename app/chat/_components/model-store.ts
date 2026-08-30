"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"

type ModelStore = {
  selectedModel: string
  setSelectedModel: (model: string) => void
}

export const useModelStore = create<ModelStore>()(
  persist(
    (set) => ({
      // Must be one of the ids in MODELS (model-selector.tsx).
      selectedModel: "openai/gpt-4o-mini",
      setSelectedModel: (model) => set({ selectedModel: model }),
    }),
    {
      name: "model-selection",
    },
  ),
)
