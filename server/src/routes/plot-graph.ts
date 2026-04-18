import type { FastifyPluginAsync } from 'fastify'
import path from 'path'
import { sanitizePathSegment } from '../utils/path-sanitizer.js'
import {
  loadPlotGraph,
  addNode,
  updateNode,
  deleteNode,
  addEdge,
  removeEdge,
  unresolvedSetups,
} from '../services/plot-graph.js'
import {
  addPlotNodeBodySchema,
  addEdgeBodySchema,
  updatePlotNodeBodySchema,
} from './schemas.js'

interface Options {
  dataDir: string
}

export const plotGraphRoutes: FastifyPluginAsync<Options> = async (app, opts) => {
  const { dataDir } = opts

  app.get('/books/:bookId/plot-graph', async (req, reply) => {
    const { bookId } = req.params as { bookId: string }
    const safeBook = sanitizePathSegment(bookId, 'bookId')
    const bookDir = path.join(dataDir, safeBook)
    const graph = loadPlotGraph(bookDir) ?? { book_id: safeBook, nodes: {}, edges: [], version: 2 as const }
    return reply.send(graph)
  })

  app.post('/books/:bookId/plot-graph/nodes', async (req, reply) => {
    const { bookId } = req.params as { bookId: string }
    const safeBook = sanitizePathSegment(bookId, 'bookId')
    const bookDir = path.join(dataDir, safeBook)
    try {
      const body = addPlotNodeBodySchema.parse(req.body)
      const node = addNode(bookDir, body)
      return reply.code(201).send(node)
    } catch (e) {
      return reply.code(400).send({ error: String((e as Error).message || e) })
    }
  })

  app.patch('/books/:bookId/plot-graph/nodes/:nodeId', async (req, reply) => {
    const { bookId, nodeId } = req.params as { bookId: string; nodeId: string }
    const safeBook = sanitizePathSegment(bookId, 'bookId')
    const bookDir = path.join(dataDir, safeBook)
    try {
      const patch = updatePlotNodeBodySchema.parse(req.body)
      const node = updateNode(bookDir, nodeId, patch)
      return reply.send(node)
    } catch (e) {
      return reply.code(400).send({ error: String((e as Error).message || e) })
    }
  })

  app.delete('/books/:bookId/plot-graph/nodes/:nodeId', async (req, reply) => {
    const { bookId, nodeId } = req.params as { bookId: string; nodeId: string }
    const safeBook = sanitizePathSegment(bookId, 'bookId')
    const bookDir = path.join(dataDir, safeBook)
    deleteNode(bookDir, nodeId)
    return reply.code(204).send()
  })

  app.post('/books/:bookId/plot-graph/edges', async (req, reply) => {
    const { bookId } = req.params as { bookId: string }
    const safeBook = sanitizePathSegment(bookId, 'bookId')
    const bookDir = path.join(dataDir, safeBook)
    try {
      const body = addEdgeBodySchema.parse(req.body)
      const edge = addEdge(bookDir, body)
      return reply.code(201).send(edge)
    } catch (e) {
      return reply.code(400).send({ error: String((e as Error).message || e) })
    }
  })

  app.delete('/books/:bookId/plot-graph/edges/:edgeId', async (req, reply) => {
    const { bookId, edgeId } = req.params as { bookId: string; edgeId: string }
    const safeBook = sanitizePathSegment(bookId, 'bookId')
    const bookDir = path.join(dataDir, safeBook)
    removeEdge(bookDir, edgeId)
    return reply.code(204).send()
  })

  app.get('/books/:bookId/plot-graph/unresolved-setups', async (req, reply) => {
    const { bookId } = req.params as { bookId: string }
    const safeBook = sanitizePathSegment(bookId, 'bookId')
    const bookDir = path.join(dataDir, safeBook)
    return reply.send(unresolvedSetups(bookDir))
  })
}
