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
        // Strip persisted `thinking` field — it's UI metadata, not part of the LLM context.
        const history: ModelMessage[] = rawHistory.map((m) => {
          const { thinking: _t, ...rest } = m as ModelMessage & { thinking?: string }
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
        })

        let fullText = ''
        let fullThinking = ''
        let pending = ''
        let segmentMode: 'content' | 'thinking' = 'content'

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
              } else {
                sse({ type: 'thinking', token: chunk })
                fullThinking += chunk
              }
            }
            pending = pending.slice(idx + marker.length)
            segmentMode = segmentMode === 'content' ? 'thinking' : 'content'
          }
        }

        for await (const part of result.fullStream) {
          switch (part.type) {
            case 'text-delta':
              // AI SDK v6 uses part.text (was part.textDelta in v5)
              pending += part.text
              drain(false)
              break
            case 'tool-call':
              toolsUsed.push(part.toolName)
              sse({
                type: 'tool_start',
                name: part.toolName,
                args_preview: JSON.stringify(part.input).slice(0, 200),
              })
              break
            case 'tool-result':
              sse({
                type: 'tool_done',
                name: part.toolName,
                result_preview: String(part.output).slice(0, 200),
              })
              break
          }
        }
        drain(true)

        streamDone = true

        // Save to history — assistant entry carries an extra `thinking` field
        // for UI replay; the LLM-bound history above strips it out.
        const assistantMsg: ModelMessage & { thinking?: string } = {
          role: 'assistant',
          content: fullText || '(Author Agent 没有生成回复)',
        }
        if (fullThinking) assistantMsg.thinking = fullThinking

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
