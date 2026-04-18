import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import {
  listMemories,
  readMemory,
  writeMemory,
  moveMemory,
  updateMemory,
  deleteMemory,
} from '../memory/memory-service.js'
import { nanoId } from '../memory/markdown-io.js'
import type { MemoryFrontmatter } from '../memory/markdown-io.js'

interface Options { dataDir: string }

const rememberBodySchema = z.object({
  text: z.string().min(1),
  scope: z.enum(['user', 'book', 'session']).default('user'),
  type: z.string().default('preference'),
  book_id: z.string().optional(),
  tags: z.array(z.string()).default([]),
})

const patchBodySchema = z.object({
  body: z.string().optional(),
  confidence: z.number().optional(),
  tags: z.array(z.string()).optional(),
  type: z.string().optional(),
})

export const memoryRoutes: FastifyPluginAsync<Options> = async (app, opts) => {
  const { dataDir } = opts

  app.get('/memory/pending', async () => listMemories(dataDir, 'pending'))
  app.get('/memory/active', async () => listMemories(dataDir, 'active'))
  app.get('/memory/archived', async () => listMemories(dataDir, 'archived'))

  app.get<{ Params: { id: string } }>('/memory/:id', async (req, reply) => {
    const m = readMemory(dataDir, req.params.id)
    if (!m) return reply.code(404).send({ error: 'not found' })
    return m
  })

  app.post<{ Params: { id: string } }>('/memory/:id/approve', async (req, reply) => {
    try {
      await moveMemory(dataDir, req.params.id, 'active')
      return { ok: true }
    } catch (e) {
      return reply.code(400).send({ error: String((e as Error).message) })
    }
  })

  app.post<{ Params: { id: string } }>('/memory/:id/reject', async (req, reply) => {
    await deleteMemory(dataDir, req.params.id)
    return reply.code(204).send()
  })

  app.post<{ Params: { id: string } }>('/memory/:id/archive', async (req, reply) => {
    try {
      await moveMemory(dataDir, req.params.id, 'archived')
      return { ok: true }
    } catch (e) {
      return reply.code(400).send({ error: String((e as Error).message) })
    }
  })

  app.post<{ Params: { id: string } }>('/memory/:id/restore', async (req, reply) => {
    try {
      await moveMemory(dataDir, req.params.id, 'active')
      return { ok: true }
    } catch (e) {
      return reply.code(400).send({ error: String((e as Error).message) })
    }
  })

  app.patch<{ Params: { id: string } }>('/memory/:id', async (req, reply) => {
    try {
      const patch = patchBodySchema.parse(req.body)
      await updateMemory(dataDir, req.params.id, patch as any)
      return { ok: true }
    } catch (e) {
      return reply.code(400).send({ error: String((e as Error).message) })
    }
  })

  app.delete<{ Params: { id: string } }>('/memory/:id', async (req, reply) => {
    await deleteMemory(dataDir, req.params.id)
    return reply.code(204).send()
  })

  app.post('/memory/remember', async (req, reply) => {
    const body = rememberBodySchema.parse(req.body)
    const now = new Date().toISOString()
    const fm: MemoryFrontmatter = {
      id: nanoId('mem'),
      scope: body.scope,
      type: body.type,
      confidence: 1.0,
      tags: body.tags,
      source: 'user_remember',
      status: 'active',
      created_at: now,
      approved_at: now,
      ...(body.book_id ? { book_id: body.book_id } : {}),
    }
    const filePath = writeMemory(dataDir, fm, body.text)
    return reply.code(201).send({ frontmatter: fm, body: body.text, filePath })
  })
}
