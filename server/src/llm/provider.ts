/**
 * LLM Provider config — creates a Vercel AI SDK provider from config.
 * Supports OpenAI, DeepSeek, DashScope, Kimi, ZhipuAI — any OpenAI-compatible endpoint.
 */
import { createOpenAI } from '@ai-sdk/openai'

export interface LLMConfig {
  apiKey: string
  baseURL?: string
  model: string
}

/**
 * Detect models that use reasoning/thinking mode by default (e.g., ZhipuAI GLM-5.x).
 * These models send output in `delta.reasoning_content` instead of `delta.content`,
 * which @ai-sdk/openai doesn't parse. We disable thinking mode via fetch wrapper.
 */
function isReasoningModel(model: string): boolean {
  const m = model.toLowerCase()
  return m.includes('glm-5') || m.includes('glm5')
}

/**
 * Create a fetch wrapper that injects `thinking: { type: "disabled" }` into
 * request bodies for models that default to reasoning mode.
 */
function createThinkingDisabledFetch() {
  const customFetch: typeof globalThis.fetch = async (url, init) => {
    if (init?.body) {
      try {
        let rawBody: string
        if (typeof init.body === 'string') {
          rawBody = init.body
        } else if (init.body instanceof ReadableStream) {
          const reader = (init.body as ReadableStream).getReader()
          const chunks: Uint8Array[] = []
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            chunks.push(value)
          }
          const combined = new Uint8Array(chunks.reduce((acc, c) => acc + c.length, 0))
          let offset = 0
          for (const c of chunks) { combined.set(c, offset); offset += c.length }
          rawBody = new TextDecoder().decode(combined)
        } else if (init.body instanceof Blob) {
          rawBody = await init.body.text()
        } else if (typeof init.body === 'object' && init.body !== null) {
          rawBody = JSON.stringify(init.body)
        } else {
          rawBody = String(init.body)
        }
        const body = JSON.parse(rawBody)
        body.thinking = { type: 'disabled' }
        init = { ...init, body: JSON.stringify(body) }
      } catch {
        // If body isn't parseable, pass through unchanged
      }
    }
    return globalThis.fetch(url, init)
  }
  return customFetch
}

export function createProvider(config: LLMConfig) {
  const needsThinkingDisable = isReasoningModel(config.model)

  const provider = createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    ...(needsThinkingDisable ? { fetch: createThinkingDisabledFetch() } : {}),
  })

  // Use .chat() to select the Chat Completions API (/chat/completions).
  // The default provider('model') uses the Responses API (/responses)
  // which non-OpenAI providers don't support.
  return provider.chat(config.model)
}
