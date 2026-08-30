import prisma from "@/lib/prisma"
import type { ChatUIMessage } from "@/lib/chat/message-metadata"

/**
 * Chat writes.
 *
 * Deliberately NOT server actions, for the reason `lib/billing.ts` documents:
 * every export of a `"use server"` module is a POST endpoint clients can call
 * with arguments of their choosing, and these accept an arbitrary chat id,
 * title and message blob. Their only caller is `/api/chat`, which is already
 * server-side, so there is nothing to gain from exposing them.
 *
 * Both take `userId` from a caller that has already resolved the session, and
 * scope their `where` clause by it as the authorization check.
 */

export async function createChatRow(
  chatId: string,
  userId: string,
  title: string,
  messages: ChatUIMessage[],
  model: string | null,
) {
  return prisma.chat.create({
    data: {
      id: chatId,
      userId,
      title,
      model,
      messages: JSON.stringify(messages),
    },
  })
}

export async function saveChatMessages(
  chatId: string,
  userId: string,
  messages: ChatUIMessage[],
  model: string | null,
) {
  return prisma.chat.update({
    where: { id: chatId, userId },
    data: {
      messages: JSON.stringify(messages),
      model,
      updatedAt: new Date(),
    },
  })
}
