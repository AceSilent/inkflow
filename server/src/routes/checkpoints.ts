import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { sanitizePathSegment } from '../utils/path-sanitizer.js'
import { deleteSnapshotsNewerThan, getSnapshotMeta, restoreSnapshot } from '../snapshots/snapshots.js'
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

function validateCheckpointRestoreTarget(
  history: ChatHistoryMessage[],
  checkpointId: string,
  messageId: string,
): void {
  const message = history.find(item => item.id === messageId)
  if (!message) throw new Error(`Checkpoint message '${messageId}' was not found in chat history`)
  if (message.role !== 'user') throw new Error(`Message '${messageId}' is not a user message`)
  if (message.checkpoint_id !== checkpointId) {
    throw new Error(`Message '${messageId}' does not belong to checkpoint '${checkpointId}'`)
  }
}

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
        const snapshot = getSnapshotMeta(dir, bookId, checkpointId)
        if (!snapshot) throw new Error(`checkpoint '${checkpointId}' not found`)
        if (snapshot.message_id !== parsed.data.message_id) {
          throw new Error(`checkpoint '${checkpointId}' does not match message '${parsed.data.message_id}'`)
        }

        validateCheckpointRestoreTarget(history, checkpointId, parsed.data.message_id)
        const truncated = truncateHistoryAtMessage(
          history,
          parsed.data.message_id,
          parsed.data.replacement_message,
        )

        restoreSnapshot(dir, bookId, checkpointId, { pruneNewer: false })
        saveHistory(dir, bookId, truncated)
        clearRunsAfterCheckpointRestore(dir, bookId)
        deleteSnapshotsNewerThan(dir, bookId, checkpointId)

        return { ok: true, messages: truncated.length }
      } catch (err) {
        reply.code(400)
        return { error: String((err as Error).message) }
      }
    },
  )
}
