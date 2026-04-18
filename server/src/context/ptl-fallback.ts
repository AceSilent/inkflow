/**
 * PTL (Prompt Too Long) fallback — when a summary/compact call blows past the
 * model context window, peel 20% off the head and retry up to MAX_PTL_RETRIES.
 * The head is the oldest / coldest content, so stripping it first minimizes
 * information loss for the tail we actually care about summarizing.
 */
import { generateText } from 'ai'
import { type LLMConfig, createProvider } from '../llm/provider.js'

export function isPromptTooLongError(e: unknown): boolean {
  if (!(e instanceof Error)) return false
  const msg = e.message.toLowerCase()
  return (msg.includes('prompt') && (msg.includes('too long') || msg.includes('exceeded')))
    || msg.includes('context_length_exceeded')
    || msg.includes('context length')
}

export function truncateHead20Percent(text: string): string {
  const cut = Math.floor(text.length * 0.2)
  return text.slice(cut)
}

export const MAX_PTL_RETRIES = 3

export async function generateWithPtlRetry(
  prompt: string,
  llmConfig: LLMConfig,
  maxOutputTokens: number = 4000,
  maxRetries: number = MAX_PTL_RETRIES,
): Promise<{ text: string; retries: number }> {
  let current = prompt
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const r = await generateText({
        model: createProvider(llmConfig),
        prompt: current,
        temperature: 0.3,
      })
      return { text: r.text, retries: attempt }
    } catch (e) {
      if (!isPromptTooLongError(e) || attempt >= maxRetries) throw e
      current = truncateHead20Percent(current)
    }
  }
  throw new Error('unreachable: loop bounds violated')
}
