"use client"

import { ChatThread } from "@/app/chat/_components/chat-thread"
import { useModelStore } from "@/app/chat/_components/model-store"
import { authClient } from "@/lib/auth-client"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

export default function ChatPage() {
  const router = useRouter()
  const { data: session, isPending } = authClient.useSession()
  const selectedModel = useModelStore((state) => state.selectedModel)

  useEffect(() => {
    if (!isPending && !session) {
      router.push("/login")
    }
  }, [session, isPending, router])

  if (isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!session) {
    return null
  }

  return <ChatThread modelId={selectedModel.id} />
}
