import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { sanitizePathSegment } from '../utils/path-sanitizer.js'
import { restoreSnapshot } from '../snapshots/snapshots.js'
import {
  loadHistoryFull,
  saveHistory,
  truncateHistoryAtMessage,
  type ChatHistoryMessage,
} from './chat-history.js'
import { clearRunsAfterCheckpointRestore } from '../runs/run-timeline.js'

export interface CheckpointRoutesOptions {
  dataDir?: string
}

const restoreBodySchema = z.object({
  message_id: z.string().min(1),
  replacement_message: z.string().min(1).max(50000).optional(),
})

export const checkpointRoutes: FastifyPluginAsync<CheckpointRoutesOptions> = async (app, opts) => {
  const dataDir = () => opts.dataDir ?? process.env.AUTONOVEL_DATA_DIR ?? 'books'

  app.post<{ Params: { bookId: string; checkpointId: string } }>(
    '/books/:bookId/checkpoints/:checkpointId/restore',
    async (request, reply) => {
      const parsed = restoreBodySchema.safeParse(request.body)
      if (!parsed.success) {
        reply.code(400)
        return { error: parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ') }
      }

      try {
        const bookId = sanitizePathSegment(request.params.bookId, 'bookId')
        const checkpointId = sanitizePathSegment(request.params.checkpointId, 'checkpointId')
        const dir = dataDir()
        const history = loadHistoryFull(dir, bookId) as ChatHistoryMessage[]
        restoreSnapshot(dir, bookId, checkpointId)
        const truncated = truncateHistoryAtMessage(
          history,
          parsed.data.message_id,
          parsed.data.replacement_message,
        )
        saveHistory(dir, bookId, truncated)
        clearRunsAfterCheckpointRestore(dir, bookId)

        return { ok: true, messages: truncated.length }
      } catch (err) {
        reply.code(400)
        return { error: String((err as Error).message) }
      }
    },
  )
}
