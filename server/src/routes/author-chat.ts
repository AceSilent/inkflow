/**
 * Author Chat SSE Route — Fastify route for streaming Author Agent responses.
 *
 * Replaces Python's author_chat.py entirely.
 * Uses Vercel AI SDK's fullStream for SSE events (text-delta, tool-call, tool-result).
 */
import fs from 'fs'
import path from 'path'
import { type FastifyInstance } from 'fastify'
import { streamText, stepCountIs, type ModelMessage } from 'ai'
import { runAgentStream } from '../agent/agent-loop.js'
import { createAllTools } from '../tools/index.js'
import { ToolRegistry } from '../tools/base-tool.js'
import { createBookTool } from '../tools/create-book.js'
import { sanitizePathSegment } from '../utils/path-sanitizer.js'
import { sendChatBody } from './schemas.js'
import { getSettings } from './settings.js'
import { bindSessionHistoryToBook, createMessageId, loadHistoryFull, loadSessionHistoryFull, saveHistory, saveSessionHistory, type ChatHistoryMessage } from './chat-history.js'
import { createStatsHooks } from '../stats/tool-stats.js'
import { createTipHooks } from '../stats/tips/index.js'
import { composeHooks, type ToolHooks } from '../tools/base-tool.js'
import { createSnapshot } from '../snapshots/snapshots.js'
import { processContext, type ContextMode } from '../context/decision.js'
import { createSessionState, updateSessionStateAfterToolCall } from '../context/session-state.js'
import { loadBreakerState, resetBreaker } from '../context/circuit-breaker.js'
import { getModelContextWindow, evaluateBudgetTier } from '../context/model-window.js'
import { appendRunEvent, createRunId, loadRecentRuns, type RunTimelineEvent, type RunEventStatus } from '../runs/run-timeline.js'
import { clearAuthorChatSession, loadAuthorChatConfig, persistUsageBestEffort, previewValue } from './author-chat-support.js'
import { ReasoningSegmentAccumulator } from './stream-segments.js'
import { persistAuthorChatTurn, prepareHistoryForAuthorChatSend, type AuthorChatTurnStatus } from './author-chat-persistence.js'
import { renderUserMessageForModel, summarizeAttachmentsForCheckpoint, type ChatAttachment } from './chat-attachments.js'
import { createProvider, type ProviderProgressEvent } from '../llm/provider.js'
import { extractMemories, ingestExtracted } from '../memory/extractor.js'

const loadConfig = loadAuthorChatConfig
export { persistUsageBestEffort }

export function buildSseHeaders(origin?: string | string[]): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  }
  const requestOrigin = Array.isArray(origin) ? origin[0] : origin
  if (requestOrigin) {
    headers['Access-Control-Allow-Origin'] = requestOrigin
    headers.Vary = 'Origin'
  }
  return headers
}

function toModelMessage(message: ChatHistoryMessage): ModelMessage {
  const {
    thinking: _thinking,
    segments: _segments,
    status: _status,
    attachments,
    id: _id,
    checkpoint_id: _checkpointId,
    ...rest
  } = message as ChatHistoryMessage & {
    thinking?: string
    segments?: unknown
    status?: string
    attachments?: ChatAttachment[]
    id?: string
    checkpoint_id?: string
  }

  if (rest.role === 'user') {
    return {
      ...rest,
      content: renderUserMessageForModel(String(rest.content ?? ''), attachments ?? []),
    } as ModelMessage
  }
  return rest as ModelMessage
}

function buildUnboundSessionSystem(mode?: string): string {
  if (mode === 'game_script') {
    return [
      '你是 InkFlow 的游戏文案策划 Agent。',
      '当前会话尚未绑定作品；先帮助用户讨论游戏世界、角色、任务链、关卡结构、互动对白、分支选项和文案语气。',
      '除非用户明确要求创建作品，或明确确认“就按这个创建/建书/新作品”，不要调用 create_book。',
      '调用 create_book 后，这个未绑定会话会成为新作品的聊天记录。',
      '回复使用中文，不要提具体模型、provider、API 名称。',
    ].join('\n')
  }

  return [
    '你是 InkFlow 的作者 Agent。',
    '当前会话尚未绑定作品；先帮助用户讨论题材、主角、世界、开场、结构和创作方向。',
    '除非用户明确要求创建作品，或明确确认“就按这个创建/建书/新作品”，不要调用 create_book。',
    '调用 create_book 后，这个未绑定会话会成为新作品的聊天记录。',
  ].join('\n')
}

export async function authorChatRoutes(app: FastifyInstance) {
  const toolRegistry = createAllTools({ includeCreateBook: false })
  const sessionToolRegistry = new ToolRegistry()
  sessionToolRegistry.register(createBookTool)

  app.get<{ Params: { sessionId: string } }>(
    '/api/v1/author-chat/sessions/:sessionId/history',
    async (request, reply) => {
      try {
        const sessionId = sanitizePathSegment(request.params.sessionId, 'sessionId')
        const { dataDir } = loadConfig()
        const history = loadSessionHistoryFull(dataDir, sessionId)
        const display = history.filter(m => m.role === 'user' || m.role === 'assistant')
        return { messages: display }
      } catch (err: any) {
        reply.code(400)
        return { error: err.message }
      }
    }
  )

  app.delete<{ Params: { sessionId: string } }>(
    '/api/v1/author-chat/sessions/:sessionId/history',
    async (request, reply) => {
      try {
        const sessionId = sanitizePathSegment(request.params.sessionId, 'sessionId')
        const { dataDir } = loadConfig()
        saveSessionHistory(dataDir, sessionId, [])
        return { status: 'ok' }
      } catch (err: any) {
        reply.code(400)
        return { error: err.message }
      }
    }
  )

  app.post<{ Params: { sessionId: string }; Body: { message: string; attachments?: ChatAttachment[]; mode?: string } }>(
    '/api/v1/author-chat/sessions/:sessionId/send',
    async (request, reply) => {
      let sessionId: string
      try {
        sessionId = sanitizePathSegment(request.params.sessionId, 'sessionId')
      } catch (err: any) {
        reply.code(400)
        return { error: err.message }
      }
      const parsed = sendChatBody.safeParse(request.body)
      if (!parsed.success) {
        reply.code(400)
        return { error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
      }
      const { message, attachments = [], mode } = parsed.data
      const modelUserMessage = renderUserMessageForModel(message, attachments)
      const { llmConfig, dataDir } = loadConfig()

      reply.raw.writeHead(200, buildSseHeaders(request.headers.origin))
      const sse = (data: unknown) => reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)

      const abortController = new AbortController()
      let streamDone = false
      const onSocketClose = () => { if (!streamDone) abortController.abort() }
      request.socket.on('close', onSocketClose)
      const createdBookRef: { current: { book_id: string; title: string } | null } = { current: null }

      try {
        const rawHistory = loadSessionHistoryFull(dataDir, sessionId)
        const history: ModelMessage[] = rawHistory
          .filter((m) => !(m as any).status)
          .map(toModelMessage)

        const model = createProvider(llmConfig, (evt: ProviderProgressEvent) => {
          if (evt.type === 'retry') {
            sse({ type: 'retry', attempt: evt.attempt, delay_ms: evt.delayMs, status: evt.status, reason: evt.reason })
          }
        })
        const result = streamText({
          model,
          system: buildUnboundSessionSystem(mode),
          messages: [...history, { role: 'user', content: modelUserMessage }],
          tools: sessionToolRegistry.toVercelTools({
            bookId: '__unbound__',
            dataDir,
            sessionId,
            mode,
            onBookCreated: async (book) => { createdBookRef.current = book },
          }),
          stopWhen: stepCountIs(8),
          temperature: 0.7,
          abortSignal: abortController.signal,
          maxRetries: 0,
          providerOptions: { openai: { parallelToolCalls: true } },
        })

        const accumulator = new ReasoningSegmentAccumulator((event) => sse(event))
        let streamError: unknown = null
        for await (const part of result.fullStream) {
          switch (part.type) {
            case 'text-delta':
              accumulator.pushText(part.text)
              break
            case 'tool-call':
              accumulator.flushForBoundary()
              accumulator.addToolCall(part.toolName, part.input)
              break
            case 'tool-result':
              accumulator.addToolResult(part.toolName, part.output)
              break
            case 'tool-error':
              accumulator.addToolError((part as any).toolName, (part as any).error)
              break
            case 'error':
              streamError = (part as any).error
              break
          }
        }
        accumulator.finalize()

        const userMessageId = createMessageId()
        const nextHistory: ChatHistoryMessage[] = [
          ...rawHistory.filter((m) => !(m as any).status),
          { role: 'user', content: message, id: userMessageId, ...(attachments.length > 0 ? { attachments } : {}) },
        ]
        if (accumulator.hasAnything()) {
          nextHistory.push({
            role: 'assistant',
            content: accumulator.fullText,
            thinking: accumulator.fullThinking,
            segments: accumulator.segments,
          } as ChatHistoryMessage)
        }

        if (createdBookRef.current) {
          bindSessionHistoryToBook(dataDir, sessionId, createdBookRef.current.book_id)
          saveHistory(dataDir, createdBookRef.current.book_id, nextHistory)
          sse({ type: 'book_created', book: createdBookRef.current })
        } else {
          saveSessionHistory(dataDir, sessionId, nextHistory)
        }

        if (streamError) {
          sse({ type: 'error', message: String((streamError as any)?.message ?? streamError).slice(0, 500) })
        }
        streamDone = true
        sse({ type: 'done', tools_used: createdBookRef.current ? ['create_book'] : [], has_thinking: accumulator.fullThinking.length > 0 })
      } catch (err: any) {
        streamDone = true
        sse({ type: 'error', message: String(err?.message ?? err).slice(0, 500) })
        sse({ type: 'done', tools_used: [], has_thinking: false })
      } finally {
        streamDone = true
        request.socket.off('close', onSocketClose)
        reply.raw.end()
      }
    }
  )

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

  app.get<{ Params: { bookId: string }; Querystring: { limit?: string } }>(
    '/api/v1/books/:bookId/runs/recent',
    async (request, reply) => {
      try {
        const bookId = sanitizePathSegment(request.params.bookId, 'bookId')
        const { dataDir } = loadConfig()
        const limit = Math.min(20, Math.max(1, Number(request.query.limit ?? 5) || 5))
        return { runs: loadRecentRuns(dataDir, bookId, limit) }
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
        clearAuthorChatSession(dataDir, bookId)
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

  // POST reset-breaker — clear compaction circuit breaker for a book.
  // Breaker trips after repeated cold-compact failures; user-initiated reset
  // lets the next turn try compaction again instead of permanently degrading
  // to decay-only.
  app.post<{ Params: { bookId: string } }>(
    '/api/v1/books/:bookId/context/reset-breaker',
    async (request, reply) => {
      try {
        const safeBook = sanitizePathSegment(request.params.bookId, 'bookId')
        const { dataDir } = loadConfig()
        const bookDir = path.join(dataDir, safeBook)
        resetBreaker(bookDir)
        return { ok: true }
      } catch (err: any) {
        reply.code(400)
        return { error: err.message }
      }
    }
  )

  // POST send — SSE streaming
  app.post<{ Params: { bookId: string }; Body: { message: string; attachments?: ChatAttachment[]; mode?: string } }>(
    '/api/v1/author-chat/:bookId/send',
    async (request, reply) => {
      let bookId: string
      try {
        bookId = sanitizePathSegment(request.params.bookId, 'bookId')
      } catch (err: any) {
        reply.code(400)
        return { error: err.message }
      }
      const parsed = sendChatBody.safeParse(request.body)
      if (!parsed.success) {
        reply.code(400)
        return { error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
      }
      const { message, attachments = [], mode, replace_message_id: replaceMessageId } = parsed.data
      const modelUserMessage = renderUserMessageForModel(message, attachments)
      const checkpointMessage = summarizeAttachmentsForCheckpoint(message, attachments)
      const { llmConfig, dataDir } = loadConfig()

      reply.raw.writeHead(200, buildSseHeaders(request.headers.origin))

      const sse = (data: unknown) =>
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)

      const toolsUsed: string[] = []
      const runId = createRunId()
      let runSeq = 0
      const timeline = (
        type: string,
        label: string,
        status: RunEventStatus,
        patch: Partial<RunTimelineEvent> = {},
        send = true,
      ): RunTimelineEvent => {
        const event: RunTimelineEvent = {
          runId,
          seq: ++runSeq,
          ts: new Date().toISOString(),
          type,
          status,
          label,
          ...patch,
        }
        try {
          appendRunEvent(dataDir, bookId, event)
        } catch (err) {
          app.log.warn({ err, bookId, runId }, '[author-chat] run timeline append failed')
        }
        if (send) sse({ type: 'timeline', event })
        return event
      }
      timeline('run_start', '收到用户指令', 'running', { inputPreview: previewValue(checkpointMessage) })

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
      // Persistence closure — set as soon as history is available, then
      // replaced once stream accumulators exist. Invoked from finally so
      // partial state survives early errors / cancellations.
      let persistAssistant: ((status?: AuthorChatTurnStatus) => void) | null = null
      let streamSucceeded = false
      const userMessageId = createMessageId()
      let checkpointId: string | undefined

      try {
        timeline('history_load_start', '读取对话历史', 'running')
        const rawHistory = prepareHistoryForAuthorChatSend(
          loadHistoryFull(dataDir, bookId),
          replaceMessageId,
        )
        timeline('history_load_done', '对话历史已读取', 'done', { meta: { messages: rawHistory.length } })
        const replayableHistory = rawHistory.filter((m) => !(m as any).status)
        // For LLM context: drop pairs marked status='incomplete' / 'aborted'
        // (failed or cancelled turns are kept on disk for UI replay but must
        // never be replayed to the model — partial assistant content + an
        // unanswered user message would corrupt subsequent reasoning).
        // Also strip UI-only metadata (`thinking`, `segments`, `status`).
        const history: ModelMessage[] = replayableHistory.map(toModelMessage)
        persistAssistant = (status: AuthorChatTurnStatus = 'incomplete') => {
          persistAuthorChatTurn({
            dataDir,
            bookId,
            history: replayableHistory,
            message,
            attachments,
            messageId: userMessageId,
            checkpointId,
            status,
          })
        }

        // Checkpoint the book state BEFORE this turn touches book content, so
        // the user can rewind to the moment right before they hit send. Logged
        // but never blocking — snapshot failure shouldn't kill the chat.
        try {
          timeline('snapshot_start', '创建发送前快照', 'running')
          const snap = createSnapshot(dataDir, bookId, checkpointMessage, { messageId: userMessageId })
          checkpointId = snap.id
          timeline('snapshot_done', '快照已创建', 'done')
        } catch (snapErr) {
          app.log.warn({ err: snapErr, bookId }, '[author-chat] snapshot failed; continuing without checkpoint')
          timeline('snapshot_error', '快照创建失败，继续执行', 'error', { error: String((snapErr as any)?.message ?? snapErr).slice(0, 500) })
        }

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

        let newMessages: ModelMessage[]
        let decision: Awaited<ReturnType<typeof processContext>>['decision']
        try {
          timeline('context_start', '处理上下文预算', 'running', { meta: { contextMode, model: llmConfig.model } })
          const processed = await processContext({
            messages: history,
            model: llmConfig.model,
            lastUsage,
            sessionState,
            bookDir,
            llmConfig,
            mode: contextMode,
          })
          newMessages = processed.newMessages
          decision = processed.decision
          timeline('context_done', '上下文处理完成', 'done', {
            meta: {
              tier: decision.tier,
              decayedCount: decision.decayedCount,
              compactedCount: decision.compactedCount,
            },
          })
        } catch (ctxErr) {
          timeline('context_error', '上下文处理失败', 'error', { error: String((ctxErr as any)?.message ?? ctxErr).slice(0, 500) })
          throw ctxErr
        }

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

        timeline('agent_loop_start', '模型与工具链运行中', 'running')
        sse({ type: 'status', phase: 'agent_loop' })

        const timelineHook: ToolHooks = {
          async beforeToolCall(name, args) {
            timeline('tool_start', `调用工具：${name}`, 'running', {
              toolName: name,
              toolCallId: `${runId}:${name}:${runSeq + 1}`,
              inputPreview: previewValue(args),
            })
          },
          async afterToolCall(name, args, result, durationMs) {
            timeline('tool_done', `工具完成：${name}`, result.startsWith('[BLOCKED]') ? 'error' : 'done', {
              toolName: name,
              inputPreview: previewValue(args),
              outputPreview: previewValue(result),
              durationMs,
              error: result.startsWith('[BLOCKED]') ? result : undefined,
            })
          },
          async onToolError(name, args, err, durationMs) {
            timeline('tool_error', `工具失败：${name}`, 'error', {
              toolName: name,
              inputPreview: previewValue(args),
              durationMs,
              error: String((err as any)?.message ?? err).slice(0, 500),
            })
          },
        }

        const result = runAgentStream({
          bookId,
          dataDir,
          userMessage: modelUserMessage,
          history: newMessages,
          llmConfig,
          toolRegistry,
          mode,
          abortSignal: abortController.signal,
          hooks: composeHooks(
            createStatsHooks(dataDir, bookId),
            createTipHooks(dataDir, bookId, (evt) => sse(evt)),
            sessionStateHook,
            timelineHook,
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
          onToolProgress: (evt) => {
            timeline(evt.type, evt.label, evt.status, {
              toolName: evt.toolName ?? evt.sourceTool,
              inputPreview: evt.inputPreview,
              outputPreview: evt.outputPreview,
              durationMs: evt.durationMs,
              error: evt.error,
              meta: evt.meta,
            })
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

        const accumulator = new ReasoningSegmentAccumulator((event) => sse(event))

        // Wire up the persister now that all accumulators + helpers exist.
        // status: undefined → normal completion (replayed to LLM next turn)
        //         'incomplete' → stream errored mid-way
        //         'aborted'    → user / client cancelled
        // 'incomplete' / 'aborted' pairs are kept for UI but excluded from LLM context.
        persistAssistant = (status?: AuthorChatTurnStatus) => {
          accumulator.finalize()
          const hasAnything = accumulator.hasAnything()
          // On clean success with no output (shouldn't happen, but) skip.
          // On failure/abort, ALWAYS save so the user's message is preserved
          // in the UI even if the agent produced nothing before being cut off.
          if (!hasAnything && !status) return
          persistAuthorChatTurn({
            dataDir,
            bookId,
            history: replayableHistory,
            message,
            attachments,
            messageId: userMessageId,
            checkpointId,
            status,
            assistant: {
              content: accumulator.fullText,
              thinking: accumulator.fullThinking,
              segments: accumulator.segments,
            },
          })
        }

        let streamError: unknown = null
        for await (const part of result.fullStream) {
          lastPartAt = Date.now()
          switch (part.type) {
            case 'text-delta':
              // AI SDK v6 uses part.text (was part.textDelta in v5)
              accumulator.pushText(part.text)
              break
            case 'tool-call': {
              toolsUsed.push(part.toolName)
              accumulator.flushForBoundary()
              if (part.toolName === 'present_options') {
                accumulator.addOptions((part.input ?? {}) as { description?: string; options?: string })
              } else {
                accumulator.addToolCall(part.toolName, part.input)
              }
              break
            }
            case 'tool-result': {
              // present_options has its own segment shape; the tool's output is
              // just the formatted echo back to the LLM, not user-facing.
              if (part.toolName === 'present_options') break
              accumulator.addToolResult(part.toolName, part.output)
              break
            }
            case 'tool-error': {
              const toolName = (part as any).toolName
              accumulator.addToolError(toolName, (part as any).error)
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
        accumulator.finalize()

        if (streamError) {
          timeline('stream_error', '模型流返回错误', 'error', { error: String((streamError as any)?.message ?? streamError).slice(0, 500) })
          timeline('agent_loop_error', '模型与工具链失败', 'error', { error: String((streamError as any)?.message ?? streamError).slice(0, 500) })
          sse({ type: 'error', message: String((streamError as any)?.message ?? streamError).slice(0, 500) })
        } else {
          streamSucceeded = true
          timeline('stream_done', '模型主响应完成', 'done')
          timeline('agent_loop_done', '模型与工具链完成', 'done')
        }

        streamDone = true

        sse({ type: 'done', tools_used: toolsUsed, has_thinking: accumulator.fullThinking.length > 0 })
        timeline('run_done', '本轮运行完成', 'done')

        // Persist usage for the NEXT turn's context manager. This is strictly
        // background telemetry: do not keep the UI in a running state for it.
        if (streamSucceeded) {
          timeline('usage_persist_start', '后台记录 token 用量', 'running', {
            message: '后台记录，不影响生成结果',
          }, false)
          ;(async () => {
            try {
              const usageStatus = await persistUsageBestEffort(result.usage, path.join(bookDir, 'last_usage.json'))
              if (usageStatus === 'timeout') {
                app.log.warn({ bookId }, '[author-chat] usage persist timed out; completing stream anyway')
                timeline('usage_persist_timeout', '后台 token 用量记录超时，不影响生成结果', 'timeout', {}, false)
              } else {
                timeline('usage_persist_done', usageStatus === 'written' ? '后台 token 用量已记录' : '后台 token 用量无需记录', 'done', { meta: { usageStatus } }, false)
              }
            } catch (usageErr) {
              app.log.warn({ err: usageErr, bookId }, '[author-chat] usage persist failed')
              timeline('usage_persist_error', '后台 token 用量记录失败，不影响生成结果', 'error', { error: String((usageErr as any)?.message ?? usageErr).slice(0, 500) }, false)
            }
          })()
        }

        // Fire-and-forget memory extraction — failure must NEVER affect main response.
        // Only runs on successful completions (not aborted / mid-stream errors); otherwise
        // we'd be feeding the extractor a partial turn with no coherent user→assistant pair.
        if (streamSucceeded) {
          timeline('memory_extract_start', '后台提取记忆', 'running', {}, false)
          ;(async () => {
            try {
              const extracted = await extractMemories({
                event: 'user_message',
                llmConfig,
                recentHistory: history.slice(-5),
                userMessage: modelUserMessage,
                bookId,
              })
              if (extracted.length > 0) {
                await ingestExtracted(dataDir, extracted)
              }
              timeline('memory_extract_done', '后台记忆提取完成', 'done', { meta: { extracted: extracted.length } }, false)
            } catch (e) {
              console.warn('[author-chat] memory extraction failed:', e)
              timeline('memory_extract_error', '后台记忆提取失败', 'error', { error: String((e as any)?.message ?? e).slice(0, 500) }, false)
            }
          })()
        }
      } catch (err: any) {
        if (abortController.signal.aborted) {
          timeline('run_aborted', '用户取消运行', 'aborted', { message: 'Stream cancelled by client' })
          sse({ type: 'aborted', message: 'Stream cancelled by client' })
        } else {
          timeline('run_error', '运行失败', 'error', { error: String(err).slice(0, 500) })
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
