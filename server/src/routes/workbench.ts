/**
 * Workbench routes — annotation CRUD for the chapter workbench UI.
 *
 * Annotations are stored per-chapter at `04_Drafts/annotations_{chId}.json`.
 * Every user highlight on the chapter text becomes one annotation record;
 * adopted editorial issues are materialised into this same list.
 */
import type { FastifyPluginAsync } from 'fastify'
import path from 'path'
import { createAnnotationSchema, updateAnnotationSchema, type Annotation } from './schemas.js'
import { sanitizePathSegment } from '../utils/path-sanitizer.js'
import { ensureDir, safeReadJson, writeJson } from '../utils/file-io.js'

interface WorkbenchOptions {
  dataDir: string
}

function annotationsFile(dataDir: string, bookId: string, chId: string): string {
  const safeBook = sanitizePathSegment(bookId, 'bookId')
  const safeCh = sanitizePathSegment(chId, 'chapterId')
  return path.join(dataDir, safeBook, '04_Drafts', `annotations_${safeCh}.json`)
}

function loadAnnotations(file: string): Annotation[] {
  return safeReadJson<Annotation[]>(file) ?? []
}

function nanoId(): string {
  return 'ann_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

export const workbenchRoutes: FastifyPluginAsync<WorkbenchOptions> = async (app, opts) => {
  const { dataDir } = opts

  app.get('/books/:bookId/chapters/:chId/annotations', async (req, reply) => {
    const { bookId, chId } = req.params as { bookId: string; chId: string }
    try {
      const file = annotationsFile(dataDir, bookId, chId)
      return reply.send(loadAnnotations(file))
    } catch (e) {
      return reply.code(400).send({ error: String(e) })
    }
  })

  app.post('/books/:bookId/chapters/:chId/annotations', async (req, reply) => {
    const { bookId, chId } = req.params as { bookId: string; chId: string }
    try {
      const body = createAnnotationSchema.parse(req.body)
      const file = annotationsFile(dataDir, bookId, chId)
      ensureDir(path.dirname(file))
      const list = loadAnnotations(file)
      const newAnn: Annotation = {
        ...body,
        id: nanoId(),
        status: 'open',
        created_at: new Date().toISOString(),
      }
      list.push(newAnn)
      writeJson(file, list)
      return reply.code(201).send(newAnn)
    } catch (e) {
      return reply.code(400).send({ error: String(e) })
    }
  })

  app.patch('/books/:bookId/chapters/:chId/annotations/:annId', async (req, reply) => {
    const { bookId, chId, annId } = req.params as { bookId: string; chId: string; annId: string }
    try {
      const patch = updateAnnotationSchema.parse(req.body)
      const file = annotationsFile(dataDir, bookId, chId)
      const list = loadAnnotations(file)
      const idx = list.findIndex((a) => a.id === annId)
      if (idx < 0) return reply.code(404).send({ error: 'Annotation not found' })
      list[idx] = { ...list[idx], ...patch }
      writeJson(file, list)
      return reply.send(list[idx])
    } catch (e) {
      return reply.code(400).send({ error: String(e) })
    }
  })

  app.delete('/books/:bookId/chapters/:chId/annotations/:annId', async (req, reply) => {
    const { bookId, chId, annId } = req.params as { bookId: string; chId: string; annId: string }
    try {
      const file = annotationsFile(dataDir, bookId, chId)
      const list = loadAnnotations(file)
      const next = list.filter((a) => a.id !== annId)
      writeJson(file, next)
      return reply.code(204).send()
    } catch (e) {
      return reply.code(400).send({ error: String(e) })
    }
  })
}
