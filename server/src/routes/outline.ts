/**
 * Outline-specific endpoints.
 *
 * Currently exposes a single POST for cascade-renumbering chapter IDs to
 * match outline order. Kept separate from `data.ts` (read-only) because
 * renumber is a mutating, safety-critical operation with its own service.
 */
import type { FastifyPluginAsync } from 'fastify'
import path from 'path'
import { sanitizePathSegment } from '../utils/path-sanitizer.js'
import { renumberChapters } from '../services/outline-renumber.js'

interface OutlineOptions {
  dataDir: string
}

export const outlineRoutes: FastifyPluginAsync<OutlineOptions> = async (app, opts) => {
  const { dataDir } = opts

  app.post('/books/:bookId/outline/renumber', async (req, reply) => {
    const { bookId } = req.params as { bookId: string }
    try {
      const safeBook = sanitizePathSegment(bookId, 'bookId')
      const bookDir = path.join(dataDir, safeBook)
      const result = await renumberChapters(bookDir)
      return reply.send(result)
    } catch (e) {
      return reply.code(500).send({ error: String(e) })
    }
  })
}
