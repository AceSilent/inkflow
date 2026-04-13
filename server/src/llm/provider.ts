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
 * Detect models that emit `delta.reasoning_content` (e.g., ZhipuAI GLM-5.x in thinking mode).
 * @ai-sdk/openai doesn't parse this field, so we transform it into normal `delta.content`
 * wrapped with markers that the SSE route splits back into thinking vs content events.
 */
function isReasoningModel(model: string): boolean {
  const m = model.toLowerCase()
  return m.includes('glm-5') || m.includes('glm5')
}

// Sentinel markers — control chars + label, vanishingly unlikely to appear in real text.
// Exported so the SSE route can split text-deltas back into thinking vs content.
export const REASONING_OPEN = '\u0002__autonovel_reasoning_open__\u0002'
export const REASONING_CLOSE = '\u0002__autonovel_reasoning_close__\u0002'

/**
 * Wrap an OpenAI-compatible streaming response so `delta.reasoning_content` chunks are
 * rewritten as `delta.content` chunks bracketed with REASONING_OPEN / REASONING_CLOSE.
 * Non-streaming responses pass through unchanged (GLM puts the final answer in
 * `message.content`, which the AI SDK reads correctly).
 */
function createReasoningFetch(): typeof globalThis.fetch {
  const customFetch: typeof globalThis.fetch = async (url, init) => {
    const response = await globalThis.fetch(url, init)
    const contentType = response.headers.get('content-type') || ''
    if (!response.body || !contentType.includes('text/event-stream')) {
      return response
    }

    const decoder = new TextDecoder()
    const encoder = new TextEncoder()
    let inReasoning = false
    let buffer = ''

    // Build a synthetic SSE event that injects a CLOSE marker as a content delta.
    const closeEvent = () =>
      'data: ' + JSON.stringify({
        choices: [{ index: 0, delta: { content: REASONING_CLOSE } }],
      })

    const processEvent = (evt: string): string => {
      if (!evt.startsWith('data: ')) return evt
      const payload = evt.slice(6)
      if (payload === '[DONE]') {
        // Safety net: if the stream ends mid-reasoning (no tool_calls / finish_reason
        // event ever closed it), prepend a CLOSE so the consumer state stays balanced.
        if (inReasoning) {
          inReasoning = false
          return closeEvent() + '\n\n' + evt
        }
        return evt
      }
      try {
        const obj = JSON.parse(payload)
        const choice = obj.choices?.[0]
        const delta = choice?.delta
        if (!delta) return evt

        if (typeof delta.reasoning_content === 'string' && delta.reasoning_content.length > 0) {
          const rc = delta.reasoning_content
          delete delta.reasoning_content
          delta.content = inReasoning ? rc : REASONING_OPEN + rc
          inReasoning = true
          return 'data: ' + JSON.stringify(obj)
        }
        if (typeof delta.content === 'string' && delta.content.length > 0 && inReasoning) {
          delta.content = REASONING_CLOSE + delta.content
          inReasoning = false
          return 'data: ' + JSON.stringify(obj)
        }
        // If reasoning is still open and this event is a tool_calls delta or carries
        // a finish_reason, close the marker BEFORE the original event. This keeps
        // the synthetic CLOSE inside the assistant turn (rather than after [DONE],
        // which can confuse multi-step tool-call continuation in AI SDK v6).
        const hasToolCalls = Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0
        const hasFinishReason = typeof choice?.finish_reason === 'string' && choice.finish_reason
        if (inReasoning && (hasToolCalls || hasFinishReason)) {
          inReasoning = false
          return closeEvent() + '\n\n' + evt
        }
        return evt
      } catch {
        return evt
      }
    }

    const transformed = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''
        if (events.length === 0) return
        const out = events.map(processEvent).join('\n\n') + '\n\n'
        controller.enqueue(encoder.encode(out))
      },
      flush(controller) {
        if (buffer) {
          const out = processEvent(buffer)
          if (out) controller.enqueue(encoder.encode(out))
        }
      },
    }))

    return new Response(transformed, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  }
  return customFetch
}

export function createProvider(config: LLMConfig) {
  const needsReasoningWrap = isReasoningModel(config.model)

  const provider = createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    ...(needsReasoningWrap ? { fetch: createReasoningFetch() } : {}),
  })

  // Use .chat() to select the Chat Completions API (/chat/completions).
  // The default provider('model') uses the Responses API (/responses)
  // which non-OpenAI providers don't support.
  return provider.chat(config.model)
}
