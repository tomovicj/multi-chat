"use client"

import { ChevronDownIcon } from "lucide-react"
import { useEffect, useState } from "react"
import type { FC, PropsWithChildren } from "react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

type ReasoningProps = {
  text: string
  status?: { type: string }
}

/**
 * Renders a model's thinking.
 *
 * assistant-ui defaults reasoning parts to `() => null`, and the route streams
 * reasoning by default, so without this a thinking model shows a blank pause
 * for as long as it reasons. Most of the OpenRouter catalog can reason, so this
 * is the difference between a working model and an apparently frozen one.
 */
export const Reasoning: FC<ReasoningProps> = ({ text, status }) => {
  const isRunning = status?.type === "running"
  const [open, setOpen] = useState(isRunning)

  // Follow along while it thinks, then fold away once the answer starts.
  useEffect(() => {
    setOpen(isRunning)
  }, [isRunning])

  if (!text) return null

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="aui-reasoning-root mb-2"
    >
      <CollapsibleTrigger
        className={cn(
          "flex items-center gap-1.5 rounded-md py-1 text-muted-foreground text-xs",
          "hover:text-foreground",
        )}
      >
        <ChevronDownIcon
          className={cn(
            "size-3.5 transition-transform",
            !open && "-rotate-90",
          )}
        />
        {isRunning ? "Thinking…" : "Thought process"}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="aui-reasoning-content mt-1 whitespace-pre-wrap border-muted border-l-2 py-1 pl-3 text-muted-foreground text-sm">
          {text}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** Keeps consecutive reasoning parts visually together. */
export const ReasoningGroup: FC<PropsWithChildren> = ({ children }) => (
  <div className="aui-reasoning-group">{children}</div>
)
