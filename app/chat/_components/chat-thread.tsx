"use client"

import { Thread } from "@/components/assistant-ui/thread"
import { AssistantRuntimeProvider } from "@assistant-ui/react"
import { AssistantChatTransport, useChatRuntime } from "@assistant-ui/react-ai-sdk"
import type { UIMessage } from "ai"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

type ChatThreadProps = {
  chatId?: string
  initialMessages?: UIMessage[]
  selectedModel: string
}

export function ChatThread({ chatId, initialMessages, selectedModel }: ChatThreadProps) {
  const router = useRouter()
  // A new thread names itself instead of waiting for the server to, so we know
  // its URL before the first message is even sent. Lazy state keeps the id
  // stable for the life of the component.
  const [currentChatId] = useState(() => chatId ?? crypto.randomUUID())
  const isNewChat = !chatId

  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: "/api/chat",
      body: {
        chatId: currentChatId,
        modelId: selectedModel,
      },
    }),
    messages: initialMessages,
    onFinish: () => {
      // The route persists the chat before it starts streaming, so by now the
      // row is guaranteed to exist and this cannot land on a 404.
      if (isNewChat) {
        router.replace(`/chat/${currentChatId}`)
      }
      // Re-render the server tree so the sidebar picks up the new or renamed chat.
      router.refresh()
    },
    onError: async (error) => {
      console.error("Chat error:", error)
      
      // Check if this is a fetch error and get the status code
      if (error.message) {
        // Try to parse the error message or check for common patterns
        if (error.message.includes("402") || error.message.toLowerCase().includes("insufficient")) {
          toast.error("Insufficient Balance", {
            description: "You don't have enough balance to continue. Please add funds to your account.",
            duration: 5000,
          })
        } else if (error.message.includes("401") || error.message.toLowerCase().includes("unauthorized")) {
          toast.error("Unauthorized", {
            description: "Please sign in to continue chatting.",
            duration: 5000,
          })
        } else {
          toast.error("Chat Error", {
            description: error.message || "An error occurred while processing your message. Please try again.",
            duration: 5000,
          })
        }
      } else {
        toast.error("Chat Error", {
          description: "An unexpected error occurred. Please try again.",
          duration: 5000,
        })
      }
    },
  })

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="h-full">
        <Thread />
      </div>
    </AssistantRuntimeProvider>
  )
}
