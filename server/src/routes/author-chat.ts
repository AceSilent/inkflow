/**
 * Author Chat SSE Route — Fastify route for streaming Author Agent responses.
 *
 * Replaces Python's author_chat.py entirely.
 * Uses Vercel AI SDK's fullStream for SSE events (text-delta, tool-call, tool-result).
 */
import fs from 'fs'
import path from 'path'
import { type FastifyInstance } from 'fastify'
import { type ModelMessage } from 'ai'
import { runAgentStream } from '../agent/agent-loop.js'
import { createAllTools } from '../tools/index.js'
import { type LLMConfig, REASONING_OPEN, REASONING_CLOSE } from '../llm/provider.js'
import { sanitizePathSegment } from '../utils/path-sanitizer.js'
import { sendChatBody } from './schemas.js'
import { getSettings } from './settings.js'
import { loadHistoryFull, saveHistory } from './chat-history.js'
import { createStatsHooks } from '../stats/tool-stats.js'
import { createTipHooks } from '../stats/tips/index.js'
import { composeHooks, type ToolHooks } from '../tools/base-tool.js'
import { createSnapshot } from '../snapshots/snapshots.js'
import { processContext, type ContextMode } from '../context/decision.js'
import { createSessionState, updateSessionStateAfterToolCall } from '../context/session-state.js'
import { loadBreakerState } from '../context/circuit-breaker.js'
import { getModelContextWindow, evaluateBudgetTier } from '../context/model-window.js'

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
        const history = loadHistoryFull(dataDir, bookId)
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

  // GET context state — debug/observability for context manager tier
  app.get<{ Params: { bookId: string } }>(
    '/api/v1/books/:bookId/debug/context-state',
    async (request, reply) => {
      try {
        const safeBook = sanitizePathSegment(request.params.bookId, 'bookId')
        const { dataDir } = loadConfig()
        const bookDir = path.join(dataDir, safeBook)
        const usageFile = path.join(bookDir, 'last_usage.json')
        const breakerState = loadBreakerState(bookDir)
        let tokensUsed = 0
        if (fs.existsSync(usageFile)) {
          try {
            tokensUsed = JSON.parse(fs.readFileSync(usageFile, 'utf8')).total_tokens ?? 0
          } catch { /* malformed usage file — treat as zero */ }
        }
        const settings = getSettings(dataDir)
        const model = settings.authorModel ?? ''
        const windowSize = getModelContextWindow(model)
        const tier = evaluateBudgetTier(tokensUsed, windowSize)

        let lastDecision: unknown = null
        const logFile = path.join(bookDir, 'context_log.jsonl')
        if (fs.existsSync(logFile)) {
          try {
            const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean)
            if (lines.length > 0) lastDecision = JSON.parse(lines[lines.length - 1])
          } catch { /* malformed log — treat as no decision */ }
        }

        return {
          current_tier: tier.name,
          current_ratio: tier.ratio,
          tokens_used: tokensUsed,
          window_size: windowSize,
          breaker_tripped: breakerState.tripped,
          last_decision: lastDecision,
        }
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
      let heartbeat: NodeJS.Timeout | null = null
      // Persistence closure — set inside try after accumulators are wired up,
      // invoked from finally so partial state survives errors / cancellations.
      let persistAssistant: ((status?: 'incomplete' | 'aborted') => void) | null = null
      let streamSucceeded = false

      try {
        // Checkpoint the book state BEFORE this turn touches anything, so the
        // user can rewind to the moment right before they hit send. Logged but
        // never blocking — snapshot failure shouldn't kill the actual chat.
        try {
          createSnapshot(dataDir, bookId, message)
        } catch (snapErr) {
          app.log.warn({ err: snapErr, bookId }, '[author-chat] snapshot failed; continuing without checkpoint')
        }

        const rawHistory = loadHistoryFull(dataDir, bookId)
        // For LLM context: drop pairs marked status='incomplete' / 'aborted'
        // (failed or cancelled turns are kept on disk for UI replay but must
        // never be replayed to the model — partial assistant content + an
        // unanswered user message would corrupt subsequent reasoning).
        // Also strip UI-only metadata (`thinking`, `segments`, `status`).
        const history: ModelMessage[] = rawHistory
          .filter((m) => !(m as any).status)
          .map((m) => {
            const { thinking: _t, segments: _s, status: _st, ...rest } = m as ModelMessage & {
              thinking?: string; segments?: unknown; status?: string
            }
            return rest as ModelMessage
          })

        // ── Context manager: evaluate budget tier + decay/compact as needed ──
        // Uses last turn's total_tokens (persisted on clean stream end below) to
        // pick a tier; on first turn of a session the file is absent so tokens=0
        // and we stay in the green (no-op) tier. Decision is always logged to
        // context_log.jsonl even when it's a no-op, so the debug panel has a
        // consistent audit trail.
        const bookDir = path.join(dataDir, bookId)
        const sessionState = createSessionState()
        const usageFile = path.join(bookDir, 'last_usage.json')
        const lastUsage = fs.existsSync(usageFile)
          ? (() => {
              try { return JSON.parse(fs.readFileSync(usageFile, 'utf8')) as { total_tokens?: number } }
              catch { return undefined }
            })()
          : undefined
        // `contextManager` is part of AppSettings (T10); default to 'auto' so
        // existing deployments without the field set get the full pipeline.
        const contextMode: ContextMode = getSettings(dataDir).contextManager ?? 'auto'

        const { newMessages, decision } = await processContext({
          messages: history,
          model: llmConfig.model,
          lastUsage,
          sessionState,
          bookDir,
          llmConfig,
          mode: contextMode,
        })

        // Append decision to context_log.jsonl (fire-and-forget; log is purely
        // for diagnostics so a write error must not kill the chat turn).
        try {
          fs.appendFileSync(
            path.join(bookDir, 'context_log.jsonl'),
            JSON.stringify({ ts: new Date().toISOString(), ...decision }) + '\n',
            'utf8',
          )
        } catch (logErr) {
          app.log.warn({ err: logErr, bookId }, '[author-chat] context_log append failed')
        }

        // Surface the context-manager decision to the frontend so it can show
        // inline notices ("decayed N tool results", "compacted M early messages").
        // Using the existing `sse()` helper keeps the type-field event shape
        // (there are no named SSE events in this stream).
        sse({ type: 'context', decision })

        // Session-state hook: update recentReads / activeSkill after each tool
        // call so cold-compact on the NEXT turn has accurate workbench state.
        // Composed alongside the existing stats + tips hooks.
        const sessionStateHook: ToolHooks = {
          async afterToolCall(name, args, result) {
            updateSessionStateAfterToolCall(sessionState, name, args, result)
          },
        }

        sse({ type: 'status', phase: 'agent_loop' })

        const result = runAgentStream({
          bookId,
          dataDir,
          userMessage: message,
          history: newMessages,
          llmConfig,
          toolRegistry,
          mode,
          abortSignal: abortController.signal,
          hooks: composeHooks(
            createStatsHooks(dataDir, bookId),
            createTipHooks(dataDir, bookId, (evt) => sse(evt)),
            sessionStateHook,
          ),
          onProgress: (evt) => {
            if (evt.type === 'retry') {
              app.log.warn(
                { bookId, attempt: evt.attempt, delayMs: evt.delayMs, status: evt.status },
                `[author-chat] LLM retry #${evt.attempt} after ${evt.delayMs}ms (HTTP ${evt.status})`
              )
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

        // Heartbeat: emit { type: 'heartbeat', elapsed_ms } every 15s while the
        // stream produces no parts, so the UI can show "等待 LLM 响应… 45s" instead
        // of looking dead during slow GLM thinking on long contexts.
        let lastPartAt = Date.now()
        heartbeat = setInterval(() => {
          if (streamDone) return
          const idleMs = Date.now() - lastPartAt
          if (idleMs >= 15000) {
            sse({ type: 'heartbeat', idle_ms: idleMs })
          }
        }, 5000)

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
          | { type: 'thinking'; text: string }
          | { type: 'tool_call'; name: string; argsPreview?: string; result?: string; status: 'running' | 'done' }
          | { type: 'options'; description: string; options: string[] }
        const segments: Segment[] = []
        let openContent: { type: 'content'; text: string } | null = null
        let openThinking: { type: 'thinking'; text: string } | null = null
        const flushOpenContent = () => {
          if (openContent && openContent.text.trim()) segments.push(openContent)
          openContent = null
        }
        const flushOpenThinking = () => {
          if (openThinking && openThinking.text.trim()) {
            segments.push(openThinking)
            sse({ type: 'thinking_done' })
          }
          openThinking = null
        }
        const appendContent = (text: string) => {
          if (!openContent) openContent = { type: 'content', text: '' }
          openContent.text += text
        }
        const appendThinking = (text: string) => {
          if (!openThinking) {
            openThinking = { type: 'thinking', text: '' }
            sse({ type: 'thinking_start' })
          }
          openThinking.text += text
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
                // appendThinking first so its synthetic thinking_start (when a
                // new block opens) lands BEFORE the matching thinking token —
                // otherwise the frontend creates an orphan segment for the
                // first chunk and a fresh one once start finally arrives.
                appendThinking(chunk)
                fullThinking += chunk
                sse({ type: 'thinking', token: chunk })
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
                appendThinking(chunk)
                fullThinking += chunk
                sse({ type: 'thinking', token: chunk })
              }
            }
            pending = pending.slice(idx + marker.length)
            // Marker = step boundary. Close out the segment we're leaving so
            // each step's thinking / content gets its own block in the UI
            // (otherwise multi-step runs collapse all thinking into one wall).
            if (segmentMode === 'thinking') flushOpenThinking()
            else flushOpenContent()
            segmentMode = segmentMode === 'content' ? 'thinking' : 'content'
          }
        }

        // Wire up the persister now that all accumulators + helpers exist.
        // status: undefined → normal completion (replayed to LLM next turn)
        //         'incomplete' → stream errored mid-way
        //         'aborted'    → user / client cancelled
        // 'incomplete' / 'aborted' pairs are kept for UI but excluded from LLM context.
        persistAssistant = (status?: 'incomplete' | 'aborted') => {
          drain(true)
          flushOpenThinking()
          flushOpenContent()
          const hasAnything = fullText.length > 0 || fullThinking.length > 0 || segments.length > 0
          // On clean success with no output (shouldn't happen, but) skip.
          // On failure/abort, ALWAYS save so the user's message is preserved
          // in the UI even if the agent produced nothing before being cut off.
          if (!hasAnything && !status) return
          const userMsg: ModelMessage & { status?: string } = { role: 'user', content: message }
          const assistantMsg: ModelMessage & { thinking?: string; segments?: Segment[]; status?: string } = {
            role: 'assistant',
            content: fullText || '(Author Agent 没有生成回复)',
          }
          if (fullThinking) assistantMsg.thinking = fullThinking
          if (segments.length > 0) assistantMsg.segments = segments
          if (status) {
            userMsg.status = status
            assistantMsg.status = status
          }
          const updatedHistory: ModelMessage[] = [...history, userMsg, assistantMsg]
          saveHistory(dataDir, bookId, updatedHistory)
        }

        let streamError: unknown = null
        for await (const part of result.fullStream) {
          lastPartAt = Date.now()
          switch (part.type) {
            case 'text-delta':
              // AI SDK v6 uses part.text (was part.textDelta in v5)
              pending += part.text
              drain(false)
              break
            case 'tool-call': {
              toolsUsed.push(part.toolName)
              // Tool boundary — flush the marker-tail buffer so any content
              // held back to avoid splitting a partial REASONING marker is
              // emitted into the current segment before we move on; then
              // close out both open buffers so the tool card renders cleanly
              // between (rather than after) the step's thinking + content.
              drain(true)
              flushOpenThinking()
              flushOpenContent()
              if (part.toolName === 'present_options') {
                // Special-case: render as interactive option cards instead of a
                // truncated args preview. Pull description + parsed option lines.
                const input = (part.input ?? {}) as { description?: string; options?: string }
                const opts = (input.options ?? '').split('\n').map(s => s.trim()).filter(Boolean)
                const seg: Segment = { type: 'options', description: input.description ?? '', options: opts }
                segments.push(seg)
                sse({ type: 'options', description: seg.description, options: seg.options })
              } else {
                const argsPreview = JSON.stringify(part.input).slice(0, 200)
                segments.push({ type: 'tool_call', name: part.toolName, argsPreview, status: 'running' })
                sse({ type: 'tool_start', name: part.toolName, args_preview: argsPreview })
              }
              break
            }
            case 'tool-result': {
              // present_options has its own segment shape; the tool's output is
              // just the formatted echo back to the LLM, not user-facing.
              if (part.toolName === 'present_options') break
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
        } else {
          streamSucceeded = true
        }

        streamDone = true

        // Persist usage so the NEXT turn's processContext has a real token
        // count to classify the budget tier against. Only on successful
        // completions (abort/error leave the file untouched — re-using the
        // previous turn's count is safer than writing a partial figure).
        if (streamSucceeded) {
          try {
            const usage: any = await result.usage
            const total = usage?.totalTokens ?? usage?.total_tokens
            if (typeof total === 'number' && total > 0) {
              fs.writeFileSync(
                path.join(bookDir, 'last_usage.json'),
                JSON.stringify({ total_tokens: total }),
                'utf8',
              )
            }
          } catch (usageErr) {
            app.log.warn({ err: usageErr, bookId }, '[author-chat] usage persist failed')
          }
        }

        sse({ type: 'done', tools_used: toolsUsed, has_thinking: fullThinking.length > 0 })

        // Fire-and-forget memory extraction — failure must NEVER affect main response.
        // Only runs on successful completions (not aborted / mid-stream errors); otherwise
        // we'd be feeding the extractor a partial turn with no coherent user→assistant pair.
        if (streamSucceeded) {
          ;(async () => {
            try {
              const { extractMemories, ingestExtracted } = await import('../memory/extractor.js')
              const extracted = await extractMemories({
                event: 'user_message',
                llmConfig,
                recentHistory: history.slice(-5),
                userMessage: message,
                bookId,
              })
              if (extracted.length > 0) {
                await ingestExtracted(dataDir, extracted)
              }
            } catch (e) {
              console.warn('[author-chat] memory extraction failed:', e)
            }
          })()
        }
      } catch (err: any) {
        if (abortController.signal.aborted) {
          sse({ type: 'aborted', message: 'Stream cancelled by client' })
        } else {
          sse({ type: 'error', message: String(err) })
        }
      } finally {
        streamDone = true
        if (heartbeat) clearInterval(heartbeat)
        request.socket.off('close', onSocketClose)
        // Persist whatever the assistant produced — even on error, abort, or
        // network failure mid-stream. Losing partial thinking + content +
        // tool-call segments because something blew up late is worse than a
        // slightly truncated entry.
        if (persistAssistant) {
          try {
            const status = streamSucceeded
              ? undefined
              : abortController.signal.aborted ? 'aborted' : 'incomplete'
            persistAssistant(status)
          } catch (saveErr) {
            app.log.error({ err: saveErr, bookId }, '[author-chat] failed to persist partial history')
          }
        }
      }

      reply.raw.end()
    }
  )
}
