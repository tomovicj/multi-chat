import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { streamText, convertToModelMessages, isTextUIPart } from "ai"
import type { ProviderMetadata } from "ai"
import auth from "@/lib/auth"
import prisma from "@/lib/prisma"
import type { ChatUIMessage } from "@/lib/chat/message-metadata"
import { parseStoredMessages, reconcile } from "@/lib/chat/thread"
import { createChatRow, saveChatMessages } from "@/lib/chats"
import { deductCost, readBalanceMicros } from "@/lib/billing"
import { estimateCostUsd, getModelCatalog } from "@/lib/models/catalog"
import type { CatalogModel } from "@/lib/models/types"
import { usdToMicros } from "@/lib/money"
import { headers } from "next/headers"

export const maxDuration = 120

type ChatRequest = {
  messages: ChatUIMessage[]
  chatId: string
  modelId?: string
}

/**
 * Pull the real cost of a turn out of OpenRouter's usage accounting, in micros.
 *
 * Requires `usage: { include: true }` on the model settings, below. OpenRouter
 * reports `cost` in USD credits. Returns null when no cost came back — free
 * models, aborted turns, and some providers — leaving the caller to fall back
 * to the catalog's rates.
 */
function costMicrosFromMetadata(
  metadata: ProviderMetadata | undefined,
): number | null {
  const usage = metadata?.openrouter?.usage

  if (!usage || typeof usage !== "object" || Array.isArray(usage)) {
    return null
  }

  const cost = (usage as { cost?: unknown }).cost

  if (typeof cost !== "number" || !Number.isFinite(cost) || cost <= 0) {
    return null
  }

  return usdToMicros(cost)
}

function getMessageText(message: ChatUIMessage): string {
  return message.parts.filter(isTextUIPart).map((part) => part.text).join("")
}

function generateTitleFromMessage(message: string): string {
  const cleaned = message.trim()
  if (cleaned.length <= 50) return cleaned
  return cleaned.substring(0, 47) + "..."
}

export async function POST(req: Request) {
  try {
    // Auth check
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    const {
      messages,
      chatId,
      modelId = "openai/gpt-4o-mini",
    }: ChatRequest = await req.json()

    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: "No messages provided" }, { status: 400 })
    }

    if (!chatId || typeof chatId !== "string") {
      return Response.json({ error: "No chatId provided" }, { status: 400 })
    }

    // Check user balance. This also converts a pre-micro-dollar account on
    // first use, so no offline migration is needed.
    const balanceMicros = await readBalanceMicros(session.user.id)

    if (balanceMicros <= 0) {
      return Response.json(
        { error: "Insufficient balance. Please add credits to continue." },
        { status: 402 },
      )
    }

    // The client picks the chat id, so it may name a chat that does not exist
    // yet, one this user owns, or — if it is lying — someone else's. Answer the
    // last case the same way as a missing chat so ids cannot be probed.
    const existing = await prisma.chat.findUnique({
      where: { id: chatId },
      select: { userId: true, messages: true },
    })

    if (existing && existing.userId !== session.user.id) {
      return Response.json({ error: "Chat not found" }, { status: 404 })
    }

    // Reconcile the client's view of the thread against the stored one. `base`
    // comes back as the server's own copies of past turns, so what gets sent to
    // the model is never the client's version of history.
    const stored = parseStoredMessages(existing?.messages)
    const reconciliation = reconcile(stored, messages)

    if (!reconciliation.ok) {
      return Response.json({ error: reconciliation.reason }, { status: 409 })
    }

    const { base, newUserMessage } = reconciliation
    const thread = newUserMessage ? [...base, newUserMessage] : base

    if (thread.length === 0) {
      return Response.json({ error: "Nothing to answer" }, { status: 400 })
    }

    // Resolve the model against the live catalog: it prices the turn when
    // OpenRouter reports no cost of its own, and it catches a stale model id
    // before the request is spent. A degraded catalog must not reject anything,
    // since we cannot tell a bad id from a list we failed to load.
    const catalog = await getModelCatalog()
    const model: CatalogModel | undefined = catalog.models.find(
      (entry) => entry.id === modelId,
    )

    if (!model && !catalog.degraded) {
      return Response.json(
        { error: `Unknown model: ${modelId}` },
        { status: 400 },
      )
    }

    // Write the thread before streaming rather than afterwards, so the client
    // can navigate to /chat/<id> the moment the stream ends without racing this
    // handler, and so a stream that dies midway still keeps the user's message.
    if (existing) {
      await saveChatMessages(chatId, session.user.id, thread, modelId)
    } else {
      const firstUserMessage = thread.find((m) => m.role === "user")
      const title = firstUserMessage
        ? generateTitleFromMessage(getMessageText(firstUserMessage) || "New Chat")
        : "New Chat"

      await createChatRow(chatId, session.user.id, title, thread, modelId)
    }

    const openrouter = createOpenRouter({
      apiKey: process.env.OPENROUTER_API_KEY,
    })

    const result = streamText({
      model: openrouter.chat(modelId, { usage: { include: true } }),
      messages: await convertToModelMessages(thread),
      // Stop burning tokens upstream when the reader goes away.
      abortSignal: req.signal,
      onError({ error }) {
        console.error("Stream error:", error)
      },
    })

    // Captured from the metadata callback below and spent in onFinish. The
    // stream transform runs the callback for every part before flushing, so
    // this is always set by the time onFinish reads it.
    let costMicros = 0

    return result.toUIMessageStreamResponse<ChatUIMessage>({
      originalMessages: thread,
      generateMessageId: () => crypto.randomUUID(),
      messageMetadata: ({ part }) => {
        if (part.type === "start") {
          return {
            custom: {
              modelId,
              modelName: model?.name ?? modelId,
              providerLabel: model?.providerLabel ?? "",
            },
          }
        }

        // `providerMetadata` rides on finish-step, not finish.
        if (part.type === "finish-step") {
          const inputTokens = part.usage.inputTokens ?? 0
          const outputTokens = part.usage.outputTokens ?? 0

          // Prefer what OpenRouter actually charged; fall back to the live
          // catalog's rates, which beat the hardcoded table this replaced.
          costMicros =
            costMicrosFromMetadata(part.providerMetadata) ??
            usdToMicros(estimateCostUsd(model, inputTokens, outputTokens))

          return { custom: { costMicros, inputTokens, outputTokens } }
        }

        return undefined
      },
      onFinish: async ({ messages: finalMessages }) => {
        // Runs on abort too, so a stopped reply is kept rather than lost.
        try {
          if (costMicros > 0) {
            await deductCost(session.user.id, costMicros)
          }

          await saveChatMessages(
            chatId,
            session.user.id,
            finalMessages,
            modelId,
          )
        } catch (error) {
          console.error("Error persisting chat:", error)
          // Don't throw - let the stream complete even if persistence fails
        }
      },
    })
  } catch (error) {
    console.error("Chat API error:", error)
    return Response.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    )
  }
}
