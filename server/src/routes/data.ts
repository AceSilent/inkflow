/**
 * Data Read Routes — Fastify routes for reading book data (outline, lore, plot-tree, chapters).
 *
 * Endpoints:
 *   GET /api/v1/books/:bookId/outline            — read outline.json
 *   GET /api/v1/books/:bookId/lore               — read combined lore data
 *   GET /api/v1/books/:bookId/plot-tree           — read plot_tree.json
 *   GET /api/v1/books/:bookId/chapters            — list chapter nodes from outline
 *   GET /api/v1/books/:bookId/chapters/:chapterId — get chapter detail with draft content
 */
import { type FastifyInstance } from 'fastify'
import fs from 'fs'
import path from 'path'
import { sanitizePathSegment } from '../utils/path-sanitizer.js'
import { outlineBody } from './schemas.js'

// ── Helper functions (exported for direct testing) ──

/**
 * Read outline.json from 02_Outlines/. Returns a default structure if file doesn't exist.
 */
export function readOutline(dataDir: string, bookId: string): any {
  const outlinePath = path.join(dataDir, bookId, '02_Outlines', 'outline.json')
  if (!fs.existsSync(outlinePath)) {
    return { id: bookId, label: '', type: 'book', children: [] }
  }
  try {
    return JSON.parse(fs.readFileSync(outlinePath, 'utf-8'))
  } catch {
    return { id: bookId, label: '', type: 'book', children: [] }
  }
}

/**
 * Read combined lore data from multiple files in a book directory.
 */
export function readLore(
  dataDir: string,
  bookId: string
): { meta: any; world_setting: any; characters: any; outline: any } {
  const bookDir = path.join(dataDir, bookId)

  function readJson(filePath: string): any {
    if (!fs.existsSync(filePath)) return null
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    } catch {
      return null
    }
  }

  const meta = readJson(path.join(bookDir, '00_Config', 'book_meta.json'))
  const world_setting = readJson(path.join(bookDir, '01_Global_Settings', 'world_lore.json'))
  const characters = readJson(path.join(bookDir, '01_Global_Settings', 'characters.json'))
  const outline = readJson(path.join(bookDir, '02_Outlines', 'outline.json'))

  return { meta, world_setting, characters, outline }
}

/**
 * Read plot_tree.json from book root. Returns { nodes: [] } if file doesn't exist.
 */
export function readPlotTree(dataDir: string, bookId: string): any {
  const treePath = path.join(dataDir, bookId, 'plot_tree.json')
  if (!fs.existsSync(treePath)) {
    return { nodes: [] }
  }
  try {
    return JSON.parse(fs.readFileSync(treePath, 'utf-8'))
  } catch {
    return { nodes: [] }
  }
}

/**
 * Recursively walk outline tree and collect all chapter-level nodes.
 */
export function listChapters(dataDir: string, bookId: string): any[] {
  const outline = readOutline(dataDir, bookId)
  const chapters: any[] = []

  function walk(node: any): void {
    if (!node) return
    if (node.type === 'chapter') {
      chapters.push({
        id: node.id,
        label: node.label,
        type: 'chapter',
        status: node.status,
        summary: node.summary,
      })
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        walk(child)
      }
    }
  }

  walk(outline)
  return chapters
}

/**
 * Find a chapter node in outline, then check for draft content in 04_Drafts/.
 */
export function getChapterDetail(
  dataDir: string,
  bookId: string,
  chapterId: string
): any {
  const outline = readOutline(dataDir, bookId)

  // Find the chapter node in the outline tree
  let chapterNode: any = null

  function findChapter(node: any): void {
    if (!node || chapterNode) return
    if (node.id === chapterId && node.type === 'chapter') {
      chapterNode = node
      return
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        findChapter(child)
      }
    }
  }

  findChapter(outline)

  if (!chapterNode) {
    return null
  }

  // Check for draft file in 04_Drafts/
  const draftsDir = path.join(dataDir, bookId, '04_Drafts')
  let content: string | null = null
  let status = 'outline'

  if (fs.existsSync(draftsDir)) {
    // Look for files matching the chapter id pattern: {chapterId}_v*.txt or {chapterId}.txt
    const files = fs.readdirSync(draftsDir)
    const draftFile = files.find(
      (f) => f === `${chapterId}.txt` || f.startsWith(`${chapterId}_v`)
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
  const outlinesDir = path.join(dataDir, bookId, '02_Outlines')
  if (!fs.existsSync(outlinesDir)) {
    fs.mkdirSync(outlinesDir, { recursive: true })
  }
  fs.writeFileSync(
    path.join(outlinesDir, 'outline.json'),
    JSON.stringify(outline, null, 2),
    'utf-8'
  )
}

/**
 * Read review results for a chapter. Reviews are stored as JSON in 04_Drafts/.
 */
export function readReview(dataDir: string, bookId: string, chapterId: string): any {
  const reviewPath = path.join(dataDir, bookId, '04_Drafts', `review_${chapterId}.json`)
  if (!fs.existsSync(reviewPath)) return null
  try {
    return JSON.parse(fs.readFileSync(reviewPath, 'utf-8'))
  } catch {
    return null
  }
}

/**
 * Write review results for a chapter.
 */
export function writeReview(dataDir: string, bookId: string, chapterId: string, review: any): void {
  const draftsDir = path.join(dataDir, bookId, '04_Drafts')
  if (!fs.existsSync(draftsDir)) {
    fs.mkdirSync(draftsDir, { recursive: true })
  }
  fs.writeFileSync(
    path.join(draftsDir, `review_${chapterId}.json`),
    JSON.stringify(review, null, 2),
    'utf-8'
  )
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

  // GET /api/v1/books/:bookId/lore
  app.get<{ Params: { bookId: string } }>(
    '/api/v1/books/:bookId/lore',
    async (request) => {
      const bookId = sanitizePathSegment(request.params.bookId, 'bookId')
      return readLore(dataDir(), bookId)
    }
  )

  // GET /api/v1/books/:bookId/plot-tree
  app.get<{ Params: { bookId: string } }>(
    '/api/v1/books/:bookId/plot-tree',
    async (request) => {
      const bookId = sanitizePathSegment(request.params.bookId, 'bookId')
      return readPlotTree(dataDir(), bookId)
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
}
