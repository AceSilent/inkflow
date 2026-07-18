import fs from 'fs'
import path from 'path'
import type { FastifyInstance } from 'fastify'
import { sanitizePathSegment } from '../utils/path-sanitizer.js'
import { clearAuthorChatSession, loadAuthorChatConfig } from './author-chat-support.js'
import { loadHistoryFull, saveHistory } from './chat-history.js'
import { createSessionState } from '../context/session-state.js'
import { processContext } from '../context/decision.js'
import { getModelContextWindow } from '../context/model-window.js'
import { organizePendingMemories } from '../memory/organizer.js'

export interface SessionRoutesOptions {
  dataDir?: string
}

export async function sessionRoutes(app: FastifyInstance, opts: SessionRoutesOptions = {}) {
  const dataDir = opts.dataDir ?? process.env.AUTONOVEL_DATA_DIR ?? 'books'

  app.delete<{ Params: { bookId: string } }>('/books/:bookId/session', async (req, reply) => {
    try {
      const bookId = sanitizePathSegment(req.params.bookId, 'bookId')
      const memoryCheckpoint = await organizePendingMemories(dataDir, bookId)
      clearAuthorChatSession(dataDir, bookId)
      return { ok: true, memory_checkpoint: memoryCheckpoint }
    } catch (e) {
      return reply.code(400).send({ error: String((e as Error).message) })
    }
  })

  app.post<{ Params: { bookId: string } }>('/books/:bookId/session/compact', async (req, reply) => {
    try {
      const bookId = sanitizePathSegment(req.params.bookId, 'bookId')
      const history = loadHistoryFull(dataDir, bookId)
        .filter(message => !(message as any).status)

      if (history.length === 0) {
        return {
          ok: true,
          status: 'noop',
          reason: 'no_history',
          compactedCount: 0,
          decayedCount: 0,
        }
      }

      const { llmConfig } = loadAuthorChatConfig(dataDir)
      const bookDir = path.join(dataDir, bookId)
      const windowSize = getModelContextWindow(llmConfig.model)
      const processed = await processContext({
        messages: history,
        model: llmConfig.model,
        lastUsage: { total_tokens: windowSize },
        sessionState: createSessionState(),
        bookDir,
        llmConfig,
        mode: 'auto',
      })

      saveHistory(dataDir, bookId, processed.newMessages)
      fs.mkdirSync(bookDir, { recursive: true })
      fs.appendFileSync(
        path.join(bookDir, 'context_log.jsonl'),
        JSON.stringify({
          ts: new Date().toISOString(),
          manual: true,
          ...processed.decision,
        }) + '\n',
        'utf8',
      )

      const compactStatus = processed.decision.compactStatus
      const status = compactStatus === 'compacted'
        ? 'compacted'
        : compactStatus === 'failed' || compactStatus === 'blocked'
          ? 'unavailable'
          : processed.decision.decayedCount > 0
            ? 'decayed'
            : 'noop'
      const reason = compactStatus === 'failed'
        ? 'compact_failed'
        : compactStatus === 'blocked'
          ? 'breaker_tripped'
          : status === 'decayed'
            ? 'warm_history_decayed'
            : status === 'noop'
              ? 'no_cold_history'
              : undefined

      return {
        ok: true,
        status,
        ...(reason ? { reason } : {}),
        compactedCount: processed.decision.compactedCount,
        decayedCount: processed.decision.decayedCount,
        tier: processed.decision.tier,
        action: processed.decision.action,
        breakerTripped: processed.decision.breakerTripped,
      }
    } catch (e) {
      return reply.code(400).send({ error: String((e as Error).message) })
    }
  })
}
