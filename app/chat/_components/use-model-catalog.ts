"use client"

import { useEffect, useState } from "react"

import type { ModelCatalog } from "@/lib/models/types"

/**
 * Shared across every mount so opening the picker twice costs one request.
 * Deliberately module-level rather than context: the catalog is immutable for
 * the life of the tab and nothing needs to re-render when it arrives elsewhere.
 */
let catalogPromise: Promise<ModelCatalog> | null = null

function loadCatalog(): Promise<ModelCatalog> {
  catalogPromise ??= fetch("/api/models")
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Model catalog request failed: ${response.status}`)
      }
      return response.json() as Promise<ModelCatalog>
    })
    .catch((error: unknown) => {
      // Clear the memo so a later open can retry instead of replaying the failure.
      catalogPromise = null
      throw error
    })

  return catalogPromise
}

/**
 * Fetch the catalog lazily.
 *
 * `enabled` is driven by the picker being opened, so a chat page that never
 * touches the model list never pays for ~400 models of JSON.
 */
export function useModelCatalog(enabled: boolean) {
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || catalog || error) return

    let cancelled = false

    loadCatalog().then(
      (loaded) => {
        if (!cancelled) setCatalog(loaded)
      },
      (loadError: unknown) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unknown error")
        }
      },
    )

    return () => {
      cancelled = true
    }
  }, [enabled, catalog, error])

  return { catalog, error, isLoading: enabled && !catalog && !error }
}
