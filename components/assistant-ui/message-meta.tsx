"use client"

import { useAuiState } from "@assistant-ui/react"
import type { FC } from "react"

import { Badge } from "@/components/ui/badge"
import { formatMicros } from "@/lib/money"

/**
 * Shows which model produced a reply, and what it cost.
 *
 * The values come from the per-message metadata `/api/chat` attaches while
 * streaming, so they survive persistence and are still correct after a reload
 * — including for older replies written by a model the user has since switched
 * away from.
 */
export const MessageMeta: FC = () => {
  const custom = useAuiState((state) =>
    state.message.role === "assistant" ? state.message.metadata.custom : undefined,
  ) as
    | {
        modelName?: string
        providerLabel?: string
        costMicros?: number
      }
    | undefined

  if (!custom?.modelName) return null

  return (
    <span className="aui-message-meta flex items-center gap-2 self-center text-muted-foreground text-xs">
      <Badge variant="secondary" className="font-normal">
        {custom.modelName}
      </Badge>
      {typeof custom.costMicros === "number" && custom.costMicros > 0 && (
        <span>{formatMicros(custom.costMicros)}</span>
      )}
    </span>
  )
}
