/**
 * Workbench routes — annotation CRUD for the chapter workbench UI.
 *
 * Annotations are stored per-chapter at `04_Drafts/annotations_{chId}.json`.
 * Every user highlight on the chapter text becomes one annotation record;
 * adopted editorial issues are materialised into this same list.
 */
import type { FastifyPluginAsync } from 'fastify'
import fs from 'fs'
import path from 'path'
import {
  createAnnotationSchema,
  updateAnnotationSchema,
  setStatusBodySchema,
  type Annotation,
  type ChapterStatus,
} from './schemas.js'
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

function statusFile(dataDir: string, bookId: string, chId: string): string {
  const safeBook = sanitizePathSegment(bookId, 'bookId')
  const safeCh = sanitizePathSegment(chId, 'chapterId')
  return path.join(dataDir, safeBook, '04_Drafts', `chapter_status_${safeCh}.json`)
}

function lockFile(dataDir: string, bookId: string, chId: string): string {
  const safeBook = sanitizePathSegment(bookId, 'bookId')
  const safeCh = sanitizePathSegment(chId, 'chapterId')
  return path.join(dataDir, safeBook, '04_Drafts', `workbench_lock_${safeCh}`)
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

  app.get('/books/:bookId/chapters/:chId/status', async (req, reply) => {
    const { bookId, chId } = req.params as { bookId: string; chId: string }
    try {
      const file = statusFile(dataDir, bookId, chId)
      const existing = safeReadJson<ChapterStatus>(file)
      if (existing) return reply.send(existing)
      return reply.send({ chapter_id: chId, user_decision: null })
    } catch (e) {
      return reply.code(400).send({ error: String(e) })
    }
  })

  app.put('/books/:bookId/chapters/:chId/status', async (req, reply) => {
    const { bookId, chId } = req.params as { bookId: string; chId: string }
    try {
      const body = setStatusBodySchema.parse(req.body)
      const file = statusFile(dataDir, bookId, chId)
      ensureDir(path.dirname(file))
      const status: ChapterStatus = {
        chapter_id: chId,
        user_decision: body.user_decision,
        decided_at: body.user_decision ? new Date().toISOString() : undefined,
        note: body.note,
      }
      writeJson(file, status)
      return reply.send(status)
    } catch (e) {
      return reply.code(400).send({ error: String(e) })
    }
  })

  // Re-submit an already-saved draft to the Editorial department WITHOUT going
  // through the Author Agent — used by the workbench "Re-review" button so a
  // human can re-run the same 5-reviewer pipeline after editing the draft
  // directly. The Agent path (submit_to_editorial tool) runs exactly the same
  // runEditorialPipelineForChapter() helper, so both entry points converge.
  //
  // Dynamic import of ../editorial/editorial.js is deliberate: it lets vitest
  // `vi.doMock()` intercept the pipeline function per-test without having to
  // plumb a dependency-injection hook through the Fastify options.
  app.post('/books/:bookId/chapters/:chId/resubmit-review', async (req, reply) => {
    const { bookId, chId } = req.params as { bookId: string; chId: string }
    try {
      const safeBook = sanitizePathSegment(bookId, 'bookId')
      const safeCh = sanitizePathSegment(chId, 'chapterId')
      const bookDir = path.join(dataDir, safeBook)
      const draftFile = path.join(bookDir, '04_Drafts', `${safeCh}.md`)
      if (!fs.existsSync(draftFile)) {
        return reply.code(400).send({ error: `Draft ${safeCh}.md not found.` })
      }
      const draftText = fs.readFileSync(draftFile, 'utf8')
      const meta = safeReadJson<{ tone?: string; genre?: string }>(
        path.join(bookDir, '00_Config', 'book_meta.json'),
      ) ?? {}

      const { runEditorialPipelineForChapter } = await import('../editorial/editorial.js')
      const result = await runEditorialPipelineForChapter({
        bookDir,
        chapterId: safeCh,
        draftText,
        bookTone: meta.tone,
        bookGenre: meta.genre,
      })
      return reply.code(200).send(result)
    } catch (e) {
      return reply.code(400).send({ error: String(e) })
    }
  })

  app.post('/books/:bookId/chapters/:chId/workbench-lock', async (req, reply) => {
    const { bookId, chId } = req.params as { bookId: string; chId: string }
    try {
      const file = lockFile(dataDir, bookId, chId)
      ensureDir(path.dirname(file))
      fs.writeFileSync(file, new Date().toISOString(), 'utf8')
      return reply.code(201).send({ locked: true })
    } catch (e) {
      return reply.code(400).send({ error: String(e) })
    }
  })

  app.delete('/books/:bookId/chapters/:chId/workbench-lock', async (req, reply) => {
    const { bookId, chId } = req.params as { bookId: string; chId: string }
    try {
      const file = lockFile(dataDir, bookId, chId)
      try {
        if (fs.existsSync(file)) fs.unlinkSync(file)
      } catch {
        // swallow — idempotent
      }
      return reply.code(204).send()
    } catch (e) {
      return reply.code(400).send({ error: String(e) })
    }
  })
}
