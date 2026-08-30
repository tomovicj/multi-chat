"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type Model = {
  id: string
  name: string
  provider: string
  contextLength: number
}

export const MODELS: Model[] = [
  {
    id: "anthropic/claude-3.5-sonnet",
    name: "Claude 3.5 Sonnet",
    provider: "Anthropic",
    contextLength: 200000,
  },
  {
    id: "openai/gpt-4o",
    name: "GPT-4o",
    provider: "OpenAI",
    contextLength: 128000,
  },
  {
    id: "openai/gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "OpenAI",
    contextLength: 128000,
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct",
    name: "Llama 3.3 70B",
    provider: "Meta",
    contextLength: 128000,
  },
  {
    id: "google/gemini-2.0-flash-exp:free",
    name: "Gemini 2.0 Flash (Free)",
    provider: "Google",
    contextLength: 1000000,
  },
  {
    id: "mistralai/mistral-large-2411",
    name: "Mistral Large",
    provider: "Mistral AI",
    contextLength: 128000,
  },
]

type ModelSelectorProps = {
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
}

export function ModelSelector({ value, onValueChange, disabled }: ModelSelectorProps) {
  const selectedModel = MODELS.find((m) => m.id === value)

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className="w-[280px]">
        <SelectValue>
          {selectedModel ? (
            <span className="flex items-center gap-2">
              <span className="font-medium">{selectedModel.name}</span>
              <span className="text-muted-foreground text-xs">
                ({selectedModel.provider})
              </span>
            </span>
          ) : (
            "Select a model"
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {MODELS.map((model) => (
          <SelectItem key={model.id} value={model.id}>
            <div className="flex flex-col items-start gap-0.5">
              <span className="font-medium">{model.name}</span>
              <span className="text-muted-foreground text-xs">
                {model.provider} • {model.contextLength.toLocaleString()} tokens
              </span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
