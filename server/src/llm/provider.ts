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
 * DashScope Qwen3 defaults to non-thinking mode; the API only returns
 * reasoning_content when the request body carries `enable_thinking: true`
 * (equivalent to the Python SDK's `extra_body={"enable_thinking": True}`).
 */
function requiresEnableThinkingFlag(model: string): boolean {
  const m = model.toLowerCase()
  return m.startsWith('qwen3') || m.includes('qwen-3')
      || m.includes('qwen3.6') || m.includes('qwen3-max') || m.includes('qwen3-plus')
}

function isDeepSeekThinkingModel(model: string): boolean {
  const m = model.toLowerCase()
  return m.includes('deepseek-v4') || m.includes('deepseek-v3.2') || m.includes('deepseek-reasoner')
}

// Sentinel markers — control chars + label, vanishingly unlikely to appear in real text.
// Exported so the SSE route can split text-deltas back into thinking vs content.
export const REASONING_OPEN = '\u0002__autonovel_reasoning_open__\u0002'
export const REASONING_CLOSE = '\u0002__autonovel_reasoning_close__\u0002'

export type ProviderProgressEvent =
  | { type: 'retry'; attempt: number; delayMs: number; status: number; reason: string }
export type ProviderProgressCallback = (evt: ProviderProgressEvent) => void

const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504])
const MAX_RETRIES = 5
const BASE_DELAY_MS = 1000   // 1s
const MAX_DELAY_MS = 30000   // cap each backoff at 30s

/**
 * Wrap an OpenAI-compatible streaming response so `delta.reasoning_content` chunks are
 * rewritten as `delta.content` chunks bracketed with REASONING_OPEN / REASONING_CLOSE.
 * Non-streaming responses pass through unchanged (GLM puts the final answer in
 * `message.content`, which the AI SDK reads correctly).
 */
/**
 * Fetch with exponential-backoff retry on transient HTTP failures (429, 5xx, etc.).
 * Fires `onProgress({ type: 'retry' })` before each backoff so the SSE route can
 * forward a retry indicator to the UI. Honors AbortSignal in init.
 */
async function fetchWithRetry(
  url: Parameters<typeof globalThis.fetch>[0],
  init: RequestInit | undefined,
  onProgress: ProviderProgressCallback | undefined,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<Response> {
  let attempt = 0
  let delay = BASE_DELAY_MS
  while (true) {
    const response = await fetchImpl(url, init)
    if (response.ok || !RETRYABLE_STATUSES.has(response.status) || attempt >= MAX_RETRIES) {
      return response
    }
    attempt += 1
    let reason = `HTTP ${response.status}`
    try {
      const txt = await response.clone().text()
      reason = txt.slice(0, 200) || reason
    } catch { /* response body unreadable, keep status text */ }
    onProgress?.({ type: 'retry', attempt, delayMs: delay, status: response.status, reason })
    await new Promise((resolve, reject) => {
      const t = setTimeout(resolve, delay)
      const sig = init?.signal
      if (sig) {
        const onAbort = () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')) }
        if (sig.aborted) onAbort()
        else sig.addEventListener('abort', onAbort, { once: true })
      }
    })
    delay = Math.min(delay * 2, MAX_DELAY_MS)
  }
}

interface DeepSeekReasoningTurn {
  reasoning: string
  toolCallIds: string[]
}

function stripOpenAICompatPrivateFields(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false

  let changed = false
  if (Array.isArray(value)) {
    for (const item of value) {
      if (stripOpenAICompatPrivateFields(item)) changed = true
    }
    return changed
  }

  const record = value as Record<string, unknown>
  if ('extra_content' in record) {
    delete record.extra_content
    changed = true
  }

  for (const child of Object.values(record)) {
    if (stripOpenAICompatPrivateFields(child)) changed = true
  }
  return changed
}

function normalizeOpenAICompatToolCallIndexes(chunk: unknown): boolean {
  if (!chunk || typeof chunk !== 'object') return false
  const choices = (chunk as any).choices
  if (!Array.isArray(choices)) return false

  let changed = false
  for (const choice of choices) {
    const toolCalls = choice?.delta?.tool_calls
    if (!Array.isArray(toolCalls)) continue
    toolCalls.forEach((call: any, index: number) => {
      if (call && typeof call === 'object' && typeof call.index !== 'number') {
        call.index = index
        changed = true
      }
    })
  }
  return changed
}

function cloneJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value))
}

function captureOpenAICompatToolCallExtras(chunk: unknown, extrasByToolCallId: Map<string, unknown>): void {
  if (!chunk || typeof chunk !== 'object') return
  const choices = (chunk as any).choices
  if (!Array.isArray(choices)) return

  for (const choice of choices) {
    const toolCalls = choice?.delta?.tool_calls
    if (!Array.isArray(toolCalls)) continue
    for (const call of toolCalls) {
      if (
        call
        && typeof call === 'object'
        && typeof call.id === 'string'
        && call.extra_content !== undefined
      ) {
        extrasByToolCallId.set(call.id, cloneJson(call.extra_content))
      }
    }
  }
}

function restoreOpenAICompatToolCallExtras(body: any, extrasByToolCallId: Map<string, unknown>): void {
  if (extrasByToolCallId.size === 0 || !Array.isArray(body?.messages)) return

  for (const message of body.messages) {
    const toolCalls = message?.tool_calls
    if (!Array.isArray(toolCalls)) continue
    for (const call of toolCalls) {
      if (
        call
        && typeof call === 'object'
        && typeof call.id === 'string'
        && call.extra_content === undefined
        && extrasByToolCallId.has(call.id)
      ) {
        call.extra_content = cloneJson(extrasByToolCallId.get(call.id))
      }
    }
  }
}

function patchDeepSeekThinkingRequestBody(body: any, turns: DeepSeekReasoningTurn[]): any {
  if (!body || typeof body !== 'object') return body
  if (body.stream === true) {
    body.thinking ??= { type: 'enabled' }
    body.reasoning_effort ??= 'high'
  }
  if (!Array.isArray(body.messages)) return body

  for (const msg of body.messages) {
    if (msg?.role !== 'assistant' || msg.reasoning_content) continue
    const ids = Array.isArray(msg.tool_calls)
      ? msg.tool_calls.map((call: any) => call?.id).filter((id: unknown): id is string => typeof id === 'string')
      : []
    if (ids.length === 0) continue
    const match = turns.find((turn) => ids.some((id: string) => turn.toolCallIds.includes(id)))
    if (match?.reasoning) msg.reasoning_content = match.reasoning
  }

  return body
}

export function createReasoningFetch(
  model: string,
  onProgress?: ProviderProgressCallback,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): typeof globalThis.fetch {
  const needsEnableThinking = requiresEnableThinkingFlag(model)
  const needsDeepSeekThinking = isDeepSeekThinkingModel(model)
  const deepSeekReasoningTurns: DeepSeekReasoningTurn[] = []
  const openAICompatToolCallExtras = new Map<string, unknown>()

  const customFetch: typeof globalThis.fetch = async (url, init) => {
    // DashScope Qwen3 opt-in to thinking mode: add enable_thinking at the top
    // level of the JSON body (mirrors the Python SDK's extra_body mechanic).
    // Cap thinking_budget so the model can't loop forever in self-questioning
    // (Qwen3 in thinking mode loves to ping-pong "should I X? no. okay, I'll
    // output... wait, should I Y? no. okay..."). 81920 tokens is the max
    // headroom we hand it; explicit caller overrides win.
    // Only do this for streaming requests.
    if (((needsEnableThinking || needsDeepSeekThinking) || openAICompatToolCallExtras.size > 0) && init?.body && typeof init.body === 'string') {
      try {
        const body = JSON.parse(init.body)
        if (needsEnableThinking && body && body.stream === true) {
          body.enable_thinking = true
          if (body.thinking_budget == null) body.thinking_budget = 81920
        }
        if (needsDeepSeekThinking) patchDeepSeekThinkingRequestBody(body, deepSeekReasoningTurns)
        restoreOpenAICompatToolCallExtras(body, openAICompatToolCallExtras)
        init = { ...init, body: JSON.stringify(body) }
      } catch { /* non-JSON body — leave alone */ }
    }

    const response = await fetchWithRetry(url, init, onProgress, fetchImpl)
    const contentType = response.headers.get('content-type') || ''
    if (!response.body || !contentType.includes('text/event-stream')) {
      return response
    }

    const decoder = new TextDecoder()
    const encoder = new TextEncoder()
    let inReasoning = false
    let buffer = ''
    let deepSeekReasoning = ''
    const deepSeekToolCallIds = new Set<string>()

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
        captureOpenAICompatToolCallExtras(obj, openAICompatToolCallExtras)
        const sanitizedProviderExtras = stripOpenAICompatPrivateFields(obj)
        const normalizedToolCallIndexes = normalizeOpenAICompatToolCallIndexes(obj)
        const choice = obj.choices?.[0]
        const delta = choice?.delta
        if (!delta) return (sanitizedProviderExtras || normalizedToolCallIndexes) ? 'data: ' + JSON.stringify(obj) : evt

        if (typeof delta.reasoning_content === 'string' && delta.reasoning_content.length > 0) {
          const rc = delta.reasoning_content
          if (needsDeepSeekThinking) deepSeekReasoning += rc
          delete delta.reasoning_content
          delta.content = inReasoning ? rc : REASONING_OPEN + rc
          inReasoning = true
          return 'data: ' + JSON.stringify(obj)
        }
        if (needsDeepSeekThinking && Array.isArray(delta.tool_calls)) {
          for (const call of delta.tool_calls) {
            if (typeof call?.id === 'string') deepSeekToolCallIds.add(call.id)
          }
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
        if (sanitizedProviderExtras || normalizedToolCallIndexes) return 'data: ' + JSON.stringify(obj)
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
        if (needsDeepSeekThinking && deepSeekReasoning && deepSeekToolCallIds.size > 0) {
          deepSeekReasoningTurns.push({
            reasoning: deepSeekReasoning,
            toolCallIds: [...deepSeekToolCallIds],
          })
        }
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

export function createProvider(config: LLMConfig, onProgress?: ProviderProgressCallback) {
  const customFetch = createReasoningFetch(config.model, onProgress)

  const provider = createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    fetch: customFetch,
  })

  // Use .chat() to select the Chat Completions API (/chat/completions).
  // The default provider('model') uses the Responses API (/responses)
  // which non-OpenAI providers don't support.
  return provider.chat(config.model)
}
