/**
 * Books CRUD Route — Fastify route for managing books as directory structures.
 *
 * Endpoints:
 *   GET    /api/v1/books           — list all books
 *   GET    /api/v1/books/explorer  — tree structure for sidebar navigation
 *   GET    /api/v1/books/:bookId   — get single book metadata
 *   POST   /api/v1/books           — create book with directory structure
 *   PATCH  /api/v1/books/:bookId   — update book metadata (title, etc.)
 *   DELETE /api/v1/books/:bookId   — delete book directory
 */
import { type FastifyInstance } from 'fastify'
import fs from 'fs'
import path from 'path'
import { sanitizePathSegment } from '../utils/path-sanitizer.js'
import { safeReadJson, ensureDir, writeJson } from '../utils/file-io.js'
import { createBookBody, updateBookBody, bookIdParam } from './schemas.js'
import { bindSessionHistoryToBook } from './chat-history.js'

// ── Types ──

export interface BookMeta {
  book_id: string
  title: string
  genre: string
  tone: string
  concept?: string
  target_words: number
  created_at?: string
}

export interface CreateBookSpaceInput {
  name: string
  book_id?: string
  concept?: string
  source_session_id?: string
}

export interface TreeNode {
  id: string
  label: string
  type: 'book' | 'volume' | 'chapter' | 'scene' | 'draft'
  status?: string
  summary?: string
  children?: TreeNode[]
}

// ── Helper functions (exported for direct testing) ──

export function listBooks(dataDir: string): BookMeta[] {
  if (!fs.existsSync(dataDir)) return []

  const books: BookMeta[] = []
  for (const entry of fs.readdirSync(dataDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const meta = safeReadJson<BookMeta>(path.join(dataDir, entry.name, '00_Config', 'book_meta.json'))
    if (meta) books.push(meta)
  }
  return books
}

export function getBook(dataDir: string, bookId: string): BookMeta | null {
  return safeReadJson<BookMeta>(path.join(dataDir, bookId, '00_Config', 'book_meta.json'))
}

export function createBook(dataDir: string, meta: BookMeta): BookMeta {
  const bookDir = path.join(dataDir, meta.book_id)

  if (fs.existsSync(bookDir)) {
    throw new Error(`Book '${meta.book_id}' already exists`)
  }

  for (const sub of ['00_Config', '01_Global_Settings', '02_Outlines', 'memory']) {
    ensureDir(path.join(bookDir, sub))
  }

  const withTimestamp: BookMeta = {
    ...meta,
    created_at: meta.created_at || new Date().toISOString(),
  }
  writeJson(path.join(bookDir, '00_Config', 'book_meta.json'), withTimestamp)

  return withTimestamp
}

export function createBookSpace(dataDir: string, input: CreateBookSpaceInput): BookMeta {
  const name = input.name.trim()
  if (!name) throw new Error('Book name is required')
  const bookId = sanitizePathSegment((input.book_id || name).trim(), 'book_id')
  const book = createBook(dataDir, {
    book_id: bookId,
    title: name,
    genre: 'unspecified',
    tone: 'unspecified',
    concept: input.concept?.trim() || '',
    target_words: 500000,
  })
  if (input.source_session_id) {
    bindSessionHistoryToBook(dataDir, input.source_session_id, book.book_id)
  }
  return book
}

export function deleteBook(dataDir: string, bookId: string): void {
  const bookDir = path.join(dataDir, bookId)
  if (!fs.existsSync(bookDir)) {
    throw new Error(`Book '${bookId}' not found`)
  }
  fs.rmSync(bookDir, { recursive: true, force: true })
}

// Update an existing book's metadata in place. Only mutable display fields are touched;
// `book_id` (the directory identity) and `created_at` are immutable, so renaming the
// title never moves the directory or renames any chapter file.
export function updateBook(
  dataDir: string,
  bookId: string,
  patch: Partial<Omit<BookMeta, 'book_id' | 'created_at'>>,
): BookMeta {
  const metaPath = path.join(dataDir, bookId, '00_Config', 'book_meta.json')
  const existing = safeReadJson<BookMeta>(metaPath)
  if (!existing) {
    throw new Error(`Book '${bookId}' not found`)
  }
  const next: BookMeta = { ...existing }
  if (patch.title !== undefined) {
    const title = patch.title.trim()
    if (!title) throw new Error('Book title cannot be empty')
    next.title = title
  }
  if (patch.genre !== undefined) next.genre = patch.genre
  if (patch.tone !== undefined) next.tone = patch.tone
  if (patch.concept !== undefined) next.concept = patch.concept
  if (patch.target_words !== undefined) next.target_words = patch.target_words
  writeJson(metaPath, next)
  return next
}

export function recoverBookIdFromRawBooksUrl(rawUrl: string | undefined, routePrefix = '/api/v1/books/'): string | null {
  if (!rawUrl) return null
  const start = rawUrl.indexOf(routePrefix)
  if (start < 0) return null
  const rawSegment = rawUrl.slice(start + routePrefix.length)
  if (!rawSegment) return null
  try {
    return decodeURIComponent(rawSegment)
  } catch {
    return rawSegment
  }
}

function scanOutlineNode(node: any): TreeNode {
  return {
    id: node.id || String(Math.random()),
    label: node.label || '',
    type: node.type || 'scene',
    status: node.status,
    summary: node.summary,
    children: node.children?.map(scanOutlineNode),
  }
}

export function explorerTree(dataDir: string): TreeNode[] {
  const books = listBooks(dataDir)

  return books.map((book) => {
    const bookDir = path.join(dataDir, book.book_id)
    const children: TreeNode[] = []
    const knownDraftFiles = new Set<string>()

    // Outline-defined chapters (canonical: outline.children → volumes → chapters)
    const outline = safeReadJson<{ children?: any[] }>(path.join(bookDir, '02_Outlines', 'outline.json'))
    if (outline?.children) {
      for (const vol of outline.children) children.push(scanOutlineNode(vol))
    }

    // Walk the just-built tree to learn which draft filenames are already
    // claimed by an outline chapter (chapter id → its draft file would be
    // ch01_v1.md / ch01.md / ${id}.txt). Anything else in 04_Drafts/ is
    // surfaced below as an orphan so the user actually sees it.
    const collectIds = (node: TreeNode) => {
      if (node.type === 'chapter') knownDraftFiles.add(node.id)
      node.children?.forEach(collectIds)
    }
    children.forEach(collectIds)

    const draftsDir = path.join(bookDir, '04_Drafts')
    if (fs.existsSync(draftsDir)) {
      const orphans: TreeNode[] = []
      for (const f of fs.readdirSync(draftsDir)) {
        if (f.startsWith('.') || f.startsWith('review_') || f.endsWith('.bak')) continue
        const stat = fs.statSync(path.join(draftsDir, f))
        if (!stat.isFile()) continue
        // Skip files clearly bound to an outline chapter (ch01.md, ch01_v1.md…)
        const bareName = f.replace(/\.(md|txt|markdown)$/i, '')
        const matchedKnown = [...knownDraftFiles].some((id) =>
          bareName === id || bareName.startsWith(`${id}_v`)
        )
        if (matchedKnown) continue
        orphans.push({
          id: `draft:${f}`,
          label: bareName,
          type: 'draft',
          summary: `${(stat.size / 1024).toFixed(1)} KB`,
        })
      }
      if (orphans.length > 0) {
        orphans.sort((a, b) => a.label.localeCompare(b.label))
        children.push({
          id: '__orphan_drafts__',
          label: '草稿（未关联大纲）',
          type: 'volume',
          children: orphans,
        })
      }
    }

    return {
      id: book.book_id,
      label: book.title,
      type: 'book',
      children,
    }
  })
}

// ── Fastify route registration ──

export async function booksRoutes(app: FastifyInstance): Promise<void> {
  const dataDir = () => process.env.AUTONOVEL_DATA_DIR || 'books'

  // GET /api/v1/books — list all books
  app.get('/api/v1/books', async () => {
    return { books: listBooks(dataDir()) }
  })

  // GET /api/v1/books/explorer — tree structure for sidebar navigation
  app.get('/api/v1/books/explorer', async () => {
    return explorerTree(dataDir())
  })

  // GET /api/v1/books/:bookId — get single book metadata
  app.get<{ Params: { bookId: string } }>(
    '/api/v1/books/:bookId',
    async (request, reply) => {
      const bookId = sanitizePathSegment(request.params.bookId, 'bookId')
      const book = getBook(dataDir(), bookId)
      if (!book) {
        reply.code(404)
        return { error: 'Book not found' }
      }
      return book
    }
  )

  // POST /api/v1/books — create book
  app.post<{ Body: BookMeta }>(
    '/api/v1/books',
    async (request, reply) => {
      try {
        const parsed = createBookBody.safeParse(request.body)
        if (!parsed.success) {
          reply.code(400)
          return { error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
        }
        const body = parsed.data as BookMeta & { source_session_id?: string }
        const { source_session_id: sourceSessionId, ...meta } = body
        sanitizePathSegment(meta.book_id, 'book_id')
        const book = createBook(dataDir(), meta)
        if (sourceSessionId) {
          bindSessionHistoryToBook(dataDir(), sourceSessionId, book.book_id)
        }
        reply.code(201)
        return book
      } catch (err: any) {
        reply.code(err.message.includes('already exists') ? 409 : 400)
        return { error: err.message }
      }
    }
  )

  // PATCH /api/v1/books/:bookId — update book metadata (title, concept, genre, tone…)
  app.patch<{ Params: { bookId: string }; Body: unknown }>(
    '/api/v1/books/:bookId',
    async (request, reply) => {
      try {
        const bookId = sanitizePathSegment(request.params.bookId, 'bookId')
        const parsed = updateBookBody.safeParse(request.body)
        if (!parsed.success) {
          reply.code(400)
          return { error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
        }
        const book = updateBook(dataDir(), bookId, parsed.data)
        return book
      } catch (err: any) {
        reply.code(err.message.includes('not found') ? 404 : 400)
        return { error: err.message }
      }
    }
  )

  // DELETE /api/v1/books/:bookId — delete book directory
  app.delete<{ Params: { bookId: string } }>(
    '/api/v1/books/:bookId',
    async (request, reply) => {
      try {
        const bookId = sanitizePathSegment(request.params.bookId, 'bookId')
        try {
          deleteBook(dataDir(), bookId)
        } catch (err: any) {
          const recovered = recoverBookIdFromRawBooksUrl(request.raw.url)
          if (!recovered || recovered === bookId) throw err
          const recoveredBookId = sanitizePathSegment(recovered, 'bookId')
          deleteBook(dataDir(), recoveredBookId)
        }
        return { status: 'ok' }
      } catch (err: any) {
        reply.code(404)
        return { error: err.message }
      }
    }
  )
}
