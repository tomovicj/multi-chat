import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { streamText, convertToModelMessages, isTextUIPart } from "ai"
import type { UIMessage } from "ai"
import auth from "@/lib/auth"
import prisma from "@/lib/prisma"
import { createChat, updateChatMessages } from "@/lib/actions/chat"
import { deductCost } from "@/lib/billing"
import { headers } from "next/headers"

export const maxDuration = 60

type ChatRequest = {
  messages: UIMessage[]
  chatId: string
  modelId?: string
}

// OpenRouter pricing (approximate, in cents per 1M tokens)
const MODEL_PRICING = {
  input: {
    "anthropic/claude-3.5-sonnet": 300, // $3 per 1M tokens
    "openai/gpt-4o": 250, // $2.50 per 1M tokens
    "openai/gpt-4o-mini": 15, // $0.15 per 1M tokens
    "meta-llama/llama-3.3-70b-instruct": 18, // $0.18 per 1M tokens
    "google/gemini-2.0-flash-exp:free": 0, // Free
    "mistralai/mistral-large-2411": 200, // $2 per 1M tokens
  },
  output: {
    "anthropic/claude-3.5-sonnet": 1500, // $15 per 1M tokens
    "openai/gpt-4o": 1000, // $10 per 1M tokens
    "openai/gpt-4o-mini": 60, // $0.60 per 1M tokens
    "meta-llama/llama-3.3-70b-instruct": 18, // $0.18 per 1M tokens
    "google/gemini-2.0-flash-exp:free": 0, // Free
    "mistralai/mistral-large-2411": 600, // $6 per 1M tokens
  },
}

function calculateCost(modelId: string, promptTokens: number, completionTokens: number): number {
  const inputCostPerMillion = MODEL_PRICING.input[modelId as keyof typeof MODEL_PRICING.input] || 100
  const outputCostPerMillion = MODEL_PRICING.output[modelId as keyof typeof MODEL_PRICING.output] || 300

  const inputCost = (promptTokens / 1_000_000) * inputCostPerMillion
  const outputCost = (completionTokens / 1_000_000) * outputCostPerMillion

  return Math.ceil(inputCost + outputCost) // Round up to nearest cent
}

function getMessageText(message: UIMessage): string {
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

    // Parse request
    const { messages, chatId, modelId = "openai/gpt-4o-mini" }: ChatRequest = await req.json()

    if (!messages || messages.length === 0) {
      return Response.json({ error: "No messages provided" }, { status: 400 })
    }

    if (!chatId) {
      return Response.json({ error: "No chatId provided" }, { status: 400 })
    }

    // Check user balance
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { balanceCents: true },
    })

    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 })
    }

    if (user.balanceCents <= 0) {
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
      select: { userId: true },
    })

    if (existing && existing.userId !== session.user.id) {
      return Response.json({ error: "Chat not found" }, { status: 404 })
    }

    // Write the row before streaming rather than in onFinish, so the client can
    // navigate to /chat/<id> the moment the stream ends without racing this
    // handler, and so a stream that dies midway still keeps the user's message.
    if (!existing) {
      const firstUserMessage = messages.find((m) => m.role === "user")
      const title = firstUserMessage
        ? generateTitleFromMessage(getMessageText(firstUserMessage) || "New Chat")
        : "New Chat"

      await createChat(chatId, title, messages)
    }

    // Create OpenRouter client
    const openrouter = createOpenRouter({
      apiKey: process.env.OPENROUTER_API_KEY,
    })

    // Stream response
    const result = streamText({
      model: openrouter.chat(modelId),
      messages: await convertToModelMessages(messages),
      async onFinish({ usage, text }) {
        try {
          // Calculate cost
          const costInCents = calculateCost(
            modelId,
            usage.inputTokens ?? 0,
            usage.outputTokens ?? 0,
          )

          // Deduct cost from user balance
          if (costInCents > 0) {
            await deductCost(session.user.id, costInCents)
          }

          // Prepare updated messages (append assistant response)
          const updatedMessages: UIMessage[] = [
            ...messages,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              parts: [{ type: "text", text }],
            },
          ]

          await updateChatMessages(chatId, updatedMessages)
        } catch (error) {
          console.error("Error in onFinish:", error)
          // Don't throw - let the stream complete even if persistence fails
        }
      },
    })

    return result.toUIMessageStreamResponse()
  } catch (error) {
    console.error("Chat API error:", error)
    return Response.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    )
  }
}
