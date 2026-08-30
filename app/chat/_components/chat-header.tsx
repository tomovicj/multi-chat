"use client"

import { ModelSelector } from "@/app/chat/_components/model-selector"
import { useModelStore } from "@/app/chat/_components/model-store"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"

export function ChatHeader() {
  const selectedModel = useModelStore((state) => state.selectedModel)
  const setSelectedModel = useModelStore((state) => state.setSelectedModel)

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="h-6" />
      <ModelSelector value={selectedModel} onValueChange={setSelectedModel} />
    </header>
  )
}
