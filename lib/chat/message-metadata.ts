import { z } from "zod"
import type { UIMessage } from "ai"

/**
 * Per-message attribution: which model wrote a reply, and what it cost.
 *
 * Nested under `custom` on purpose. assistant-ui's message converter copies
 * only an allowlist of metadata keys onto the rendered message
 * (`unstable_state`, `unstable_annotations`, `unstable_data`, `steps`,
 * `custom`, `submittedFeedback`) — flat metadata is silently dropped and never
 * reaches the UI. Read it back with `useAuiState((s) => s.message.metadata.custom)`.
 *
 * Everything is optional because the fields arrive in two waves: `modelId` and
 * `modelName` on the `start` part, the usage numbers on `finish-step`.
 */
export const messageMetadataSchema = z.object({
  custom: z
    .object({
      modelId: z.string(),
      modelName: z.string(),
      providerLabel: z.string(),
      costMicros: z.number().int().nonnegative(),
      inputTokens: z.number().int().nonnegative(),
      outputTokens: z.number().int().nonnegative(),
    })
    .partial()
    .optional(),
})

export type ChatMessageMetadata = z.infer<typeof messageMetadataSchema>

/** The `UIMessage` shape used across this app, server and client alike. */
export type ChatUIMessage = UIMessage<ChatMessageMetadata>
