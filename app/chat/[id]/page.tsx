import auth from "@/lib/auth"
import { getChatById } from "@/lib/actions/chat"
import { parseStoredMessages } from "@/lib/chat/thread"
import { ChatThreadWrapper } from "@/app/chat/_components/chat-thread-wrapper"
import { headers } from "next/headers"

export default async function ChatIdPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    throw new Error("Unauthorized")
  }

  const { id } = await params
  const chat = await getChatById(id)

  return (
    <ChatThreadWrapper
      chatId={chat.id}
      initialMessages={parseStoredMessages(chat.messages)}
    />
  )
}
