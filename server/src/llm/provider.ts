/**
 * LLM Provider config — creates a Vercel AI SDK provider from config.
 * Supports OpenAI, DeepSeek, DashScope, Kimi — any OpenAI-compatible endpoint.
 */
import { createOpenAI } from '@ai-sdk/openai'

export interface LLMConfig {
  apiKey: string
  baseURL?: string
  model: string
}

export function createProvider(config: LLMConfig) {
  const provider = createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  })
  return provider(config.model)
}
