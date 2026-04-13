/**
 * Author Chat SSE Route — Fastify route for streaming Author Agent responses.
 *
 * Replaces Python's author_chat.py entirely.
 * Uses Vercel AI SDK's fullStream for SSE events (text-delta, tool-call, tool-result).
 */
import { type FastifyInstance } from 'fastify'
import { type ModelMessage } from 'ai'
import { runAgentStream } from '../agent/agent-loop.js'
import { createAllTools } from '../tools/index.js'
import { type LLMConfig, REASONING_OPEN, REASONING_CLOSE } from '../llm/provider.js'
import { sanitizePathSegment } from '../utils/path-sanitizer.js'
import { sendChatBody } from './schemas.js'
import { getSettings } from './settings.js'
import { loadHistory, saveHistory } from './chat-history.js'
import { createStatsHooks } from '../stats/tool-stats.js'

/**
 * Resolve LLM config from settings.json (provider/model selector).
 * Falls back to environment variables if settings not configured.
 */
function loadConfig(): { llmConfig: LLMConfig; dataDir: string } {
  const dataDir = process.env.AUTONOVEL_DATA_DIR || 'books'

  // Try settings.json first
  const settings = getSettings(dataDir)
  const modelSelector = settings.authorModel || ''

  if (modelSelector.includes('/')) {
    const [providerId, ...modelParts] = modelSelector.split('/')
    const model = modelParts.join('/')
    const provider = settings.providers.find(p => p.id === providerId)
    if (provider) {
      return {
        llmConfig: {
          apiKey: provider.apiKey,
          baseURL: provider.baseUrl,
          model,
        },
        dataDir,
      }
    }
  }

  // Fallback to environment variables
  return {
    llmConfig: {
      apiKey: process.env.LLM_API_KEY || '',
      baseURL: process.env.LLM_BASE_URL,
      model: process.env.LLM_MODEL || 'gpt-4o',
    },
    dataDir,
  }
}

export async function authorChatRoutes(app: FastifyInstance) {
  const toolRegistry = createAllTools()

  // GET history
  app.get<{ Params: { bookId: string } }>(
    '/api/v1/author-chat/:bookId/history',
    async (request, reply) => {
      try {
        const bookId = sanitizePathSegment(request.params.bookId, 'bookId')
        const { dataDir } = loadConfig()
        const history = loadHistory(dataDir, bookId)
        const display = history.filter(m => m.role === 'user' || m.role === 'assistant')
        return { messages: display }
      } catch (err: any) {
        reply.code(400)
        return { error: err.message }
      }
    }
  )

  // DELETE history
  app.delete<{ Params: { bookId: string } }>(
    '/api/v1/author-chat/:bookId/history',
    async (request, reply) => {
      try {
        const bookId = sanitizePathSegment(request.params.bookId, 'bookId')
        const { dataDir } = loadConfig()
        saveHistory(dataDir, bookId, [])
        return { status: 'ok' }
      } catch (err: any) {
        reply.code(400)
        return { error: err.message }
      }
    }
  )

  // POST send — SSE streaming
  app.post<{ Params: { bookId: string }; Body: { message: string; mode?: string } }>(
    '/api/v1/author-chat/:bookId/send',
    async (request, reply) => {
      let bookId: string
      try {
        bookId = sanitizePathSegment(request.params.bookId, 'bookId')
      } catch (err: any) {
        reply.code(400)
        return { error: err.message }
      }
      const { message, mode } = request.body
      const parsed = sendChatBody.safeParse(request.body)
      if (!parsed.success) {
        reply.code(400)
        return { error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
      }
      const { llmConfig, dataDir } = loadConfig()

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      })

      const sse = (data: Record<string, unknown>) =>
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)

      const toolsUsed: string[] = []

      // AbortController for client disconnect
      // Listen on the response socket, not the request —
      // request.raw 'close' fires when the POST body is consumed,
      // not when the client actually disconnects.
      const abortController = new AbortController()
      let streamDone = false
      const onSocketClose = () => {
        if (!streamDone) {
          abortController.abort()
        }
      }
      request.socket.on('close', onSocketClose)

      try {
        const rawHistory = loadHistory(dataDir, bookId)
        // Strip persisted UI metadata (`thinking`, `segments`) — neither belongs in the
        // LLM context: thinking is just the reasoning trace, segments are a UI-only
        // breakdown of content + tool calls already represented elsewhere by AI SDK.
        const history: ModelMessage[] = rawHistory.map((m) => {
          const { thinking: _t, segments: _s, ...rest } = m as ModelMessage & { thinking?: string; segments?: unknown }
          return rest as ModelMessage
        })

        sse({ type: 'status', phase: 'agent_loop' })

        const result = runAgentStream({
          bookId,
          dataDir,
          userMessage: message,
          history,
          llmConfig,
          toolRegistry,
          mode,
          abortSignal: abortController.signal,
          hooks: createStatsHooks(dataDir, bookId),
          onProgress: (evt) => {
            if (evt.type === 'retry') {
              sse({
                type: 'retry',
                attempt: evt.attempt,
                delay_ms: evt.delayMs,
                status: evt.status,
                reason: evt.reason,
              })
            }
          },
        })

        let fullText = ''
        let fullThinking = ''
        let pending = ''
        let segmentMode: 'content' | 'thinking' = 'content'

        // Mirror the segments the frontend would build live: ordered list of
        // {type:'content',text} | {type:'tool_call',name,argsPreview,result?}
        // entries, persisted with the assistant message so reload restores
        // tool calls and interleaving instead of just collapsing to plain text.
        type Segment =
          | { type: 'content'; text: string }
          | { type: 'tool_call'; name: string; argsPreview?: string; result?: string; status: 'running' | 'done' }
        const segments: Segment[] = []
        let openContent: { type: 'content'; text: string } | null = null
        const flushOpenContent = () => {
          if (openContent && openContent.text.trim()) segments.push(openContent)
          openContent = null
        }
        const appendContent = (text: string) => {
          if (!openContent) {
            openContent = { type: 'content', text: '' }
          }
          openContent.text += text
        }

        // Drain `pending`, splitting on REASONING_OPEN/CLOSE markers, emitting
        // SSE events for each side and accumulating into fullText / fullThinking.
        // Holds back up to (markerLen-1) chars to avoid splitting a partial marker.
        const drain = (final: boolean) => {
          while (pending.length > 0) {
            const marker = segmentMode === 'content' ? REASONING_OPEN : REASONING_CLOSE
            const idx = pending.indexOf(marker)
            if (idx === -1) {
              const keep = final ? 0 : marker.length - 1
              const flushLen = pending.length - keep
              if (flushLen <= 0) return
              const chunk = pending.slice(0, flushLen)
              pending = pending.slice(flushLen)
              if (segmentMode === 'content') {
                sse({ type: 'content', token: chunk })
                fullText += chunk
                appendContent(chunk)
              } else {
                sse({ type: 'thinking', token: chunk })
                fullThinking += chunk
              }
              return
            }
            if (idx > 0) {
              const chunk = pending.slice(0, idx)
              if (segmentMode === 'content') {
                sse({ type: 'content', token: chunk })
                fullText += chunk
                appendContent(chunk)
              } else {
                sse({ type: 'thinking', token: chunk })
                fullThinking += chunk
              }
            }
            pending = pending.slice(idx + marker.length)
            segmentMode = segmentMode === 'content' ? 'thinking' : 'content'
          }
        }

        let streamError: unknown = null
        for await (const part of result.fullStream) {
          switch (part.type) {
            case 'text-delta':
              // AI SDK v6 uses part.text (was part.textDelta in v5)
              pending += part.text
              drain(false)
              break
            case 'tool-call': {
              toolsUsed.push(part.toolName)
              const argsPreview = JSON.stringify(part.input).slice(0, 200)
              flushOpenContent()
              segments.push({ type: 'tool_call', name: part.toolName, argsPreview, status: 'running' })
              sse({ type: 'tool_start', name: part.toolName, args_preview: argsPreview })
              break
            }
            case 'tool-result': {
              const preview = String(part.output).slice(0, 200)
              for (let i = segments.length - 1; i >= 0; i--) {
                const s = segments[i]
                if (s.type === 'tool_call' && s.name === part.toolName && s.status === 'running') {
                  s.status = 'done'
                  s.result = preview
                  break
                }
              }
              sse({ type: 'tool_done', name: part.toolName, result_preview: preview })
              break
            }
            case 'tool-error': {
              const preview = `[error] ${String((part as any).error).slice(0, 200)}`
              const toolName = (part as any).toolName
              for (let i = segments.length - 1; i >= 0; i--) {
                const s = segments[i]
                if (s.type === 'tool_call' && s.name === toolName && s.status === 'running') {
                  s.status = 'done'
                  s.result = preview
                  break
                }
              }
              sse({ type: 'tool_done', name: toolName, result_preview: preview })
              break
            }
            case 'error':
              // AI SDK v6 surfaces upstream LLM errors (rate limits, network, etc.)
              // as fullStream parts rather than throwing — capture so we can SSE
              // them out instead of silently ending with no assistant content.
              streamError = (part as any).error
              break
          }
        }
        drain(true)
        flushOpenContent()

        if (streamError) {
          sse({ type: 'error', message: String((streamError as any)?.message ?? streamError).slice(0, 500) })
        }

        streamDone = true

        // Save to history — assistant entry carries extra `thinking` and
        // `segments` fields for UI replay; the LLM-bound history (above) strips
        // them out so they never round-trip back to the model.
        const assistantMsg: ModelMessage & { thinking?: string; segments?: Segment[] } = {
          role: 'assistant',
          content: fullText || '(Author Agent 没有生成回复)',
        }
        if (fullThinking) assistantMsg.thinking = fullThinking
        if (segments.length > 0) assistantMsg.segments = segments

        const updatedHistory: ModelMessage[] = [
          ...history,
          { role: 'user' as const, content: message },
          assistantMsg,
        ]
        saveHistory(dataDir, bookId, updatedHistory)

        sse({ type: 'done', tools_used: toolsUsed, has_thinking: fullThinking.length > 0 })
      } catch (err: any) {
        if (abortController.signal.aborted) {
          sse({ type: 'aborted', message: 'Stream cancelled by client' })
        } else {
          sse({ type: 'error', message: String(err) })
        }
      } finally {
        streamDone = true
        request.socket.off('close', onSocketClose)
      }

      reply.raw.end()
    }
  )
}
