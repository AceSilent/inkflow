/**
 * Data Read Routes — Fastify routes for reading book data (outline, lore, chapters).
 *
 * Endpoints:
 *   GET /api/v1/books/:bookId/outline            — read outline.json
 *   GET /api/v1/books/:bookId/lore               — read combined lore data
 *   GET /api/v1/books/:bookId/chapters            — list chapter nodes from outline
 *   GET /api/v1/books/:bookId/chapters/:chapterId — get chapter detail with draft content
 */
import { type FastifyInstance } from 'fastify'
import fs from 'fs'
import path from 'path'
import { sanitizePathSegment } from '../utils/path-sanitizer.js'
import { safeReadJson, writeJson, ensureDir } from '../utils/file-io.js'
import { collectChapters, findChapterById } from '../utils/outline.js'
import { outlineBody } from './schemas.js'
import { loadStats } from '../stats/tool-stats.js'
import { archivePriorDraft } from '../tools/draft-history.js'
import { createBackup } from '../tools/safety.js'
import { getCreativeStageStatus } from '../agent/creative-stage.js'
import { defaultGameOutline, validateGameOutlineRoot } from '../game-outline.js'

// ── Helper functions (exported for direct testing) ──

/**
 * Read outline.json from 02_Outlines/. Returns a default structure if file doesn't exist.
 */
export function readOutline(dataDir: string, bookId: string): any {
  return safeReadJson(path.join(dataDir, bookId, '02_Outlines', 'outline.json'))
    ?? { id: bookId, label: '', type: 'book', children: [] }
}

/**
 * Read the game-copywriting outline. This intentionally uses a separate file
 * from the novel chapter outline so arcs/packages/stages never collide with chapters.
 */
export function readGameOutline(dataDir: string, bookId: string): any {
  return safeReadJson(path.join(dataDir, bookId, '02_Outlines', 'game_outline.json'))
    ?? defaultGameOutline(bookId)
}

/**
 * Read combined lore data from multiple files in a book directory.
 */
export function readLore(
  dataDir: string,
  bookId: string
): { meta: any; world_setting: any; characters: any; outline: any } {
  const bookDir = path.join(dataDir, bookId)
  return {
    meta: safeReadJson(path.join(bookDir, '00_Config', 'book_meta.json')),
    world_setting: safeReadJson(path.join(bookDir, '01_Global_Settings', 'world_lore.json')),
    characters: safeReadJson(path.join(bookDir, '01_Global_Settings', 'characters.json')),
    outline: safeReadJson(path.join(bookDir, '02_Outlines', 'outline.json')),
  }
}

/**
 * Recursively walk outline tree and collect all chapter-level nodes.
 */
export function listChapters(dataDir: string, bookId: string): any[] {
  return collectChapters(readOutline(dataDir, bookId))
    .map(c => ({ id: c.id, label: c.label, type: 'chapter', status: c.status, summary: c.summary }))
}

/**
 * Find a chapter node in outline, then check for draft content in 04_Drafts/.
 * Special-case: chapterId of the form "draft:filename.md" returns an orphan
 * draft (file in 04_Drafts/ with no matching outline chapter), so the UI can
 * still surface drafts the agent saved before the outline got fleshed out.
 */
export function getChapterDetail(
  dataDir: string,
  bookId: string,
  chapterId: string
): any {
  const draftsDir = path.join(dataDir, bookId, '04_Drafts')

  // Orphan draft path
  if (chapterId.startsWith('draft:')) {
    const fname = chapterId.slice('draft:'.length)
    // Resolve both sides before comparing, otherwise path.join returns a
    // relative string that never startsWith the absolute draftsDir.
    const draftPath = path.resolve(draftsDir, fname)
    const draftsRoot = path.resolve(draftsDir)
    if (!draftPath.startsWith(draftsRoot + path.sep) || !fs.existsSync(draftPath)) {
      return null
    }
    const content = fs.readFileSync(draftPath, 'utf-8')
    const bareName = fname.replace(/\.(md|txt|markdown)$/i, '')
    return {
      id: chapterId,
      label: bareName,
      summary: '未关联大纲的草稿文件',
      content,
      status: 'draft',
      word_count: content.length,
    }
  }

  const chapterNode = findChapterById(readOutline(dataDir, bookId), chapterId)
  if (!chapterNode) return null

  // Check for draft file in 04_Drafts/. Accept .md, .txt, and the historical
  // {id}_v{N} suffix pattern from earlier versions.
  let content: string | null = null
  let status = 'outline'

  if (fs.existsSync(draftsDir)) {
    const files = fs.readdirSync(draftsDir)
    const draftFile = files.find(
      (f) =>
        f === `${chapterId}.md` ||
        f === `${chapterId}.txt` ||
        f.startsWith(`${chapterId}_v`)
    )

    if (draftFile) {
      const draftPath = path.join(draftsDir, draftFile)
      try {
        content = fs.readFileSync(draftPath, 'utf-8')
        status = 'draft'
      } catch {
        content = null
      }
    }
  }

  return {
    id: chapterNode.id,
    label: chapterNode.label,
    summary: chapterNode.summary,
    content,
    status,
    word_count: content ? content.length : 0,
  }
}

/**
 * Write outline.json to 02_Outlines/. Creates directory if needed.
 */
export function writeOutline(dataDir: string, bookId: string, outline: any): void {
  writeJson(path.join(dataDir, bookId, '02_Outlines', 'outline.json'), outline)
}

/**
 * Write game_outline.json to 02_Outlines/. Creates directory if needed.
 */
export function writeGameOutline(dataDir: string, bookId: string, outline: any): void {
  const error = validateGameOutlineRoot(outline)
  if (error) throw new Error(error)
  writeJson(path.join(dataDir, bookId, '02_Outlines', 'game_outline.json'), outline)
}

export function listScriptPackages(dataDir: string, bookId: string): any[] {
  const scriptsDir = path.join(dataDir, bookId, '03_Scripts')
  if (!fs.existsSync(scriptsDir)) return []

  return fs.readdirSync(scriptsDir)
    .filter(file => file.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b))
    .map(file => {
      const packageId = file.replace(/\.json$/i, '')
      const data = safeReadJson<any>(path.join(scriptsDir, file)) ?? {}
      const stages = Array.isArray(data.stages) ? data.stages : []
      const reviewStates = { approved: 0, draft: 0, review: 0 }
      let lineCount = 0
      let choiceCount = 0

      for (const stage of stages) {
        const state = stage?.review_state
        if (state === 'approved') {
          reviewStates.approved += 1
        } else if (state === 'review') {
          reviewStates.review += 1
        } else {
          reviewStates.draft += 1
        }
        lineCount += Array.isArray(stage?.lines) ? stage.lines.length : 0
        choiceCount += Array.isArray(stage?.choices) ? stage.choices.length : 0
      }

      return {
        package_id: typeof data.id === 'string' && data.id.length > 0 ? data.id : packageId,
        name: typeof data.name === 'string' && data.name.length > 0 ? data.name : packageId,
        source_locale: typeof data.source_locale === 'string' && data.source_locale.length > 0 ? data.source_locale : 'zh-CN',
        stage_count: stages.length,
        line_count: lineCount,
        choice_count: choiceCount,
        review_states: reviewStates,
      }
    })
}

export function readScriptPackage(dataDir: string, bookId: string, packageId: string): any | null {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(packageId)) return null
  return safeReadJson(path.join(dataDir, bookId, '03_Scripts', `${packageId}.json`))
}

/**
 * Read review results for a chapter. Reviews are stored as JSON in 04_Drafts/.
 */
export function readReview(dataDir: string, bookId: string, chapterId: string): any {
  return safeReadJson(path.join(dataDir, bookId, '04_Drafts', `review_${chapterId}.json`))
}

/**
 * Write review results for a chapter.
 */
export function writeReview(dataDir: string, bookId: string, chapterId: string, review: any): void {
  writeJson(path.join(dataDir, bookId, '04_Drafts', `review_${chapterId}.json`), review)
}

// ── Fastify route registration ──

export async function dataRoutes(app: FastifyInstance): Promise<void> {
  const dataDir = () => process.env.AUTONOVEL_DATA_DIR || 'books'

  // GET /api/v1/books/:bookId/outline
  app.get<{ Params: { bookId: string } }>(
    '/api/v1/books/:bookId/outline',
    async (request) => {
      const bookId = sanitizePathSegment(request.params.bookId, 'bookId')
      return readOutline(dataDir(), bookId)
    }
  )

  // PUT /api/v1/books/:bookId/outline
  app.put<{ Params: { bookId: string } }>(
    '/api/v1/books/:bookId/outline',
    async (request, reply) => {
      try {
        const bookId = sanitizePathSegment(request.params.bookId, 'bookId')
        const parsed = outlineBody.safeParse(request.body)
        if (!parsed.success) {
          reply.code(400)
          return { error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
        }
        writeOutline(dataDir(), bookId, parsed.data)
        return { status: 'ok' }
      } catch (err: any) {
        reply.code(400)
        return { error: err.message }
      }
    }
  )

  // GET /api/v1/books/:bookId/game-outline
  app.get<{ Params: { bookId: string } }>(
    '/api/v1/books/:bookId/game-outline',
    async (request) => {
      const bookId = sanitizePathSegment(request.params.bookId, 'bookId')
      return readGameOutline(dataDir(), bookId)
    }
  )

  // PUT /api/v1/books/:bookId/game-outline
  app.put<{ Params: { bookId: string } }>(
    '/api/v1/books/:bookId/game-outline',
    async (request, reply) => {
      try {
        const bookId = sanitizePathSegment(request.params.bookId, 'bookId')
        const error = validateGameOutlineRoot(request.body)
        if (error) {
          reply.code(400)
          return { error }
        }
        writeGameOutline(dataDir(), bookId, request.body)
        return { status: 'ok' }
      } catch (err: any) {
        reply.code(400)
        return { error: err.message }
      }
    }
  )

  // GET /api/v1/books/:bookId/lore
  app.get<{ Params: { bookId: string } }>(
    '/api/v1/books/:bookId/lore',
    async (request) => {
      const bookId = sanitizePathSegment(request.params.bookId, 'bookId')
      return readLore(dataDir(), bookId)
    }
  )

  // GET /api/v1/books/:bookId/creative-stage
  app.get<{ Params: { bookId: string } }>(
    '/api/v1/books/:bookId/creative-stage',
    async (request) => {
      const bookId = sanitizePathSegment(request.params.bookId, 'bookId')
      const bookDir = path.join(dataDir(), bookId)
      return getCreativeStageStatus(bookDir)
    }
  )

  // GET /api/v1/books/:bookId/scripts
  app.get<{ Params: { bookId: string } }>(
    '/api/v1/books/:bookId/scripts',
    async (request) => {
      const bookId = sanitizePathSegment(request.params.bookId, 'bookId')
      return { scripts: listScriptPackages(dataDir(), bookId) }
    }
  )

  // GET /api/v1/books/:bookId/scripts/:packageId
  app.get<{ Params: { bookId: string; packageId: string } }>(
    '/api/v1/books/:bookId/scripts/:packageId',
    async (request, reply) => {
      const bookId = sanitizePathSegment(request.params.bookId, 'bookId')
      const packageId = sanitizePathSegment(request.params.packageId, 'packageId')
      const pkg = readScriptPackage(dataDir(), bookId, packageId)
      if (!pkg) {
        reply.code(404)
        return { error: 'Script package not found' }
      }
      return pkg
    }
  )

  // GET /api/v1/books/:bookId/chapters
  app.get<{ Params: { bookId: string } }>(
    '/api/v1/books/:bookId/chapters',
    async (request) => {
      const bookId = sanitizePathSegment(request.params.bookId, 'bookId')
      return { chapters: listChapters(dataDir(), bookId) }
    }
  )

  // GET /api/v1/books/:bookId/chapters/:chapterId
  app.get<{ Params: { bookId: string; chapterId: string } }>(
    '/api/v1/books/:bookId/chapters/:chapterId',
    async (request, reply) => {
      const bookId = sanitizePathSegment(request.params.bookId, 'bookId')
      const chapterId = sanitizePathSegment(request.params.chapterId, 'chapterId')
      const detail = getChapterDetail(dataDir(), bookId, chapterId)
      if (!detail) {
        reply.code(404)
        return { error: 'Chapter not found' }
      }
      return detail
    }
  )

  // PUT /api/v1/books/:bookId/chapters/:chapterId/draft — manual save from workbench
  app.put<{
    Params: { bookId: string; chapterId: string }
    Body: { content: string }
  }>(
    '/api/v1/books/:bookId/chapters/:chapterId/draft',
    async (request, reply) => {
      const bookId = sanitizePathSegment(request.params.bookId, 'bookId')
      const chapterId = sanitizePathSegment(request.params.chapterId, 'chapterId')
      const body = request.body
      if (!body || typeof body.content !== 'string') {
        reply.code(400)
        return { error: 'content required' }
      }
      const bookDir = path.join(dataDir(), bookId)
      const draftFile = path.join(bookDir, '04_Drafts', `${chapterId}.md`)
      ensureDir(path.dirname(draftFile))
      // Archive the prior draft into .draft_history/ and drop a .bak alongside
      // the file — same safety story as save_draft uses.
      archivePriorDraft(bookDir, draftFile)
      createBackup(draftFile)
      fs.writeFileSync(draftFile, body.content, 'utf-8')
      return { ok: true, bytes: Buffer.byteLength(body.content, 'utf-8') }
    }
  )

  // GET /api/v1/books/:bookId/chapters/:chapterId/reviews
  app.get<{ Params: { bookId: string; chapterId: string } }>(
    '/api/v1/books/:bookId/chapters/:chapterId/reviews',
    async (request) => {
      const bookId = sanitizePathSegment(request.params.bookId, 'bookId')
      const chapterId = sanitizePathSegment(request.params.chapterId, 'chapterId')
      const review = readReview(dataDir(), bookId, chapterId)
      return review ?? { feedbacks: [] }
    }
  )

  // GET /api/v1/books/:bookId/stats — tool/skill invocation stats
  app.get<{ Params: { bookId: string } }>(
    '/api/v1/books/:bookId/stats',
    async (request) => {
      const bookId = sanitizePathSegment(request.params.bookId, 'bookId')
      return { stats: loadStats(dataDir(), bookId) }
    }
  )
}
