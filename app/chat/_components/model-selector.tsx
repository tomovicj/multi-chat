"use client"

import { useDeferredValue, useMemo, useState } from "react"
import { AlertTriangleIcon, Loader2Icon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox"
import { useModelCatalog } from "@/app/chat/_components/use-model-catalog"
import type { SelectedModel } from "@/app/chat/_components/model-store"
import { formatContext, formatPricingSummary } from "@/lib/models/format"
import type { CatalogModel } from "@/lib/models/types"

/**
 * OpenRouter lists ~400 models across ~58 providers. base-ui's Combobox does not
 * virtualise, so the visible rows are capped and search is what reaches the
 * long tail.
 */
const MAX_VISIBLE = 60

type ModelGroup = { value: string; items: CatalogModel[] }

function matchesQuery(model: CatalogModel, query: string): boolean {
  return (
    model.id.toLowerCase().includes(query) ||
    model.name.toLowerCase().includes(query) ||
    model.providerLabel.toLowerCase().includes(query)
  )
}

function groupByProvider(models: CatalogModel[]): ModelGroup[] {
  const groups = new Map<string, CatalogModel[]>()

  for (const model of models) {
    const existing = groups.get(model.providerLabel)
    if (existing) existing.push(model)
    else groups.set(model.providerLabel, [model])
  }

  return [...groups].map(([value, items]) => ({ value, items }))
}

type ModelSelectorProps = {
  value: SelectedModel
  onValueChange: (model: SelectedModel) => void
  recentIds: string[]
  disabled?: boolean
}

export function ModelSelector({
  value,
  onValueChange,
  recentIds,
  disabled,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const deferredQuery = useDeferredValue(query)

  // Only fetch once the picker has actually been opened.
  const { catalog, error, isLoading } = useModelCatalog(open)
  const models = useMemo(() => catalog?.models ?? [], [catalog])

  const allGroups = useMemo(() => groupByProvider(models), [models])

  const visibleGroups = useMemo(() => {
    const trimmed = deferredQuery.trim().toLowerCase()

    if (trimmed) {
      const matched = models.filter((model) => matchesQuery(model, trimmed))
      return groupByProvider(matched.slice(0, MAX_VISIBLE))
    }

    // No query: lead with what this user actually uses, then fill up to the cap.
    const recent = recentIds
      .map((id) => models.find((model) => model.id === id))
      .filter((model): model is CatalogModel => model !== undefined)

    const recentIdSet = new Set(recent.map((model) => model.id))
    const rest = models
      .filter((model) => !recentIdSet.has(model.id))
      .slice(0, MAX_VISIBLE - recent.length)

    const groups = groupByProvider(rest)

    return recent.length > 0
      ? [{ value: "Recent", items: recent }, ...groups]
      : groups
  }, [models, deferredQuery, recentIds])

  const shownCount = visibleGroups.reduce(
    (total, group) => total + group.items.length,
    0,
  )

  const isKnown =
    models.length === 0 || models.some((model) => model.id === value.id)

  return (
    <Combobox
      items={allGroups}
      filteredItems={visibleGroups}
      value={value.id}
      onValueChange={(id: string | null) => {
        const picked = models.find((model) => model.id === id)
        if (picked) {
          onValueChange({
            id: picked.id,
            name: picked.name,
            providerLabel: picked.providerLabel,
          })
        }
      }}
      open={open}
      onOpenChange={setOpen}
      inputValue={query}
      onInputValueChange={setQuery}
      disabled={disabled}
    >
      <ComboboxTrigger
        render={
          <Button
            variant="outline"
            className="w-[280px] justify-between font-normal"
          />
        }
      >
        <span className="flex min-w-0 items-center gap-2">
          {!isKnown && (
            <AlertTriangleIcon className="text-muted-foreground size-3.5 shrink-0" />
          )}
          <span className="truncate font-medium">{value.name}</span>
          {value.providerLabel && (
            <span className="text-muted-foreground shrink-0 text-xs">
              {value.providerLabel}
            </span>
          )}
        </span>
      </ComboboxTrigger>

      <ComboboxContent className="w-[420px]">
        <ComboboxInput placeholder="Search models" showTrigger={false} />

        {catalog?.degraded && (
          <p className="text-muted-foreground border-b px-3 py-2 text-xs">
            Showing a built-in list — the live catalog could not be reached.
          </p>
        )}

        <ComboboxList>
          <ComboboxEmpty>
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Loader2Icon className="size-4 animate-spin" />
                Loading models…
              </span>
            ) : error ? (
              "Could not load models."
            ) : (
              "No models found."
            )}
          </ComboboxEmpty>

          <ComboboxCollection>
            {(group: ModelGroup) => (
              <ComboboxGroup key={group.value} items={group.items}>
                <ComboboxLabel>{group.value}</ComboboxLabel>
                <ComboboxCollection>
                  {(model: CatalogModel) => (
                    <ComboboxItem key={model.id} value={model.id}>
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate font-medium">{model.name}</span>
                        <span className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
                          <span>{formatContext(model.contextLength)} ctx</span>
                          <span>·</span>
                          <span>{formatPricingSummary(model.pricing)}</span>
                          {model.supportsReasoning && (
                            <Badge variant="secondary">Thinking</Badge>
                          )}
                          {model.inputModalities.includes("image") && (
                            <Badge variant="secondary">Vision</Badge>
                          )}
                          {model.supportsTools && (
                            <Badge variant="secondary">Tools</Badge>
                          )}
                        </span>
                      </div>
                    </ComboboxItem>
                  )}
                </ComboboxCollection>
              </ComboboxGroup>
            )}
          </ComboboxCollection>
        </ComboboxList>

        {models.length > shownCount && (
          <p className="text-muted-foreground border-t px-3 py-2 text-xs">
            Showing {shownCount} of {models.length} — type to search.
          </p>
        )}
      </ComboboxContent>
    </Combobox>
  )
}
