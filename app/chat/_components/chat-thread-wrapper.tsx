"use client"

import { ChatThread } from "@/app/chat/_components/chat-thread"
import { useModelStore } from "@/app/chat/_components/model-store"
import type { UIMessage } from "ai"

type ChatThreadWrapperProps = {
  chatId?: string
  initialMessages?: UIMessage[]
}

export function ChatThreadWrapper({ chatId, initialMessages }: ChatThreadWrapperProps) {
  const selectedModel = useModelStore((state) => state.selectedModel)

  return (
    <ChatThread
      chatId={chatId}
      initialMessages={initialMessages}
      selectedModel={selectedModel}
    />
  )
}
