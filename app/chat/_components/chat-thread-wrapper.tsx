"use client"

import { useEffect, useRef } from "react"

import { ChatThread } from "@/app/chat/_components/chat-thread"
import {
  useModelStore,
  type SelectedModel,
} from "@/app/chat/_components/model-store"
import type { ChatUIMessage } from "@/lib/chat/message-metadata"

type ChatThreadWrapperProps = {
  chatId?: string
  initialMessages?: ChatUIMessage[]
}

/**
 * The model that last answered in this thread.
 *
 * Read back out of message metadata rather than a separate lookup: the reply
 * already carries the id, name and provider label needed to label the picker.
 */
function lastAnsweringModel(
  messages: ChatUIMessage[] | undefined,
): SelectedModel | null {
  if (!messages) return null

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    const custom = message.metadata?.custom

    if (message.role === "assistant" && custom?.modelId && custom.modelName) {
      return {
        id: custom.modelId,
        name: custom.modelName,
        providerLabel: custom.providerLabel ?? "",
      }
    }
  }

  return null
}

export function ChatThreadWrapper({
  chatId,
  initialMessages,
}: ChatThreadWrapperProps) {
  const selectedModel = useModelStore((state) => state.selectedModel)
  const setSelectedModel = useModelStore((state) => state.setSelectedModel)

  // Reopening a chat restores the model it was last answered with. Guarded by
  // a ref rather than the dependency list so that a router.refresh() handing
  // down a new array identity cannot undo a model switch made mid-chat.
  const seededChatId = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (seededChatId.current === chatId) return
    seededChatId.current = chatId

    const previous = lastAnsweringModel(initialMessages)

    if (previous && previous.id !== useModelStore.getState().selectedModel.id) {
      setSelectedModel(previous)
    }
  }, [chatId, initialMessages, setSelectedModel])

  return (
    <ChatThread
      chatId={chatId}
      initialMessages={initialMessages}
      modelId={selectedModel.id}
    />
  )
}
