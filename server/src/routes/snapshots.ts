/**
 * Snapshot routes — list / restore / delete book checkpoints.
 *
 * Endpoints:
 *   GET    /api/v1/books/:bookId/snapshots                   — list, newest first
 *   POST   /api/v1/books/:bookId/snapshots/:snapId/restore   — rewind book to snap
 *   DELETE /api/v1/books/:bookId/snapshots/:snapId           — drop a snap
 */
import { type FastifyInstance } from 'fastify'
import { sanitizePathSegment } from '../utils/path-sanitizer.js'
import { listSnapshots, restoreSnapshot, deleteSnapshot } from '../snapshots/snapshots.js'

export async function snapshotRoutes(app: FastifyInstance): Promise<void> {
  const dataDir = () => process.env.AUTONOVEL_DATA_DIR || 'books'

  app.get<{ Params: { bookId: string } }>(
    '/api/v1/books/:bookId/snapshots',
    async (request) => {
      const bookId = sanitizePathSegment(request.params.bookId, 'bookId')
      return { snapshots: listSnapshots(dataDir(), bookId) }
    }
  )

  app.post<{ Params: { bookId: string; snapId: string } }>(
    '/api/v1/books/:bookId/snapshots/:snapId/restore',
    async (request, reply) => {
      try {
        const bookId = sanitizePathSegment(request.params.bookId, 'bookId')
        const snapId = sanitizePathSegment(request.params.snapId, 'snapId')
        restoreSnapshot(dataDir(), bookId, snapId)
        return { status: 'ok' }
      } catch (err: any) {
        reply.code(404)
        return { error: err.message }
      }
    }
  )

  app.delete<{ Params: { bookId: string; snapId: string } }>(
    '/api/v1/books/:bookId/snapshots/:snapId',
    async (request, reply) => {
      try {
        const bookId = sanitizePathSegment(request.params.bookId, 'bookId')
        const snapId = sanitizePathSegment(request.params.snapId, 'snapId')
        deleteSnapshot(dataDir(), bookId, snapId)
        return { status: 'ok' }
      } catch (err: any) {
        reply.code(400)
        return { error: err.message }
      }
    }
  )
}
