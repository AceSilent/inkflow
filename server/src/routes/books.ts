/**
 * Books CRUD Route — Fastify route for managing books as directory structures.
 *
 * Endpoints:
 *   GET    /api/v1/books           — list all books
 *   GET    /api/v1/books/explorer  — tree structure for sidebar navigation
 *   GET    /api/v1/books/:bookId   — get single book metadata
 *   POST   /api/v1/books           — create book with directory structure
 *   DELETE /api/v1/books/:bookId   — delete book directory
 */
import { type FastifyInstance } from 'fastify'
import fs from 'fs'
import path from 'path'

// ── Types ──

export interface BookMeta {
  book_id: string
  title: string
  genre: string
  tone: string
  target_words: number
  created_at?: string
}

export interface TreeNode {
  id: string
  label: string
  type: 'book' | 'volume' | 'chapter' | 'scene'
  status?: string
  summary?: string
  children?: TreeNode[]
}

// ── Helper functions (exported for direct testing) ──

export function listBooks(dataDir: string): BookMeta[] {
  if (!fs.existsSync(dataDir)) return []

  const entries = fs.readdirSync(dataDir, { withFileTypes: true })
  const books: BookMeta[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const metaPath = path.join(dataDir, entry.name, '00_Config', 'book_meta.json')
    if (!fs.existsSync(metaPath)) continue
    try {
      const raw = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
      books.push(raw as BookMeta)
    } catch {
      // skip malformed
    }
  }

  return books
}

export function getBook(dataDir: string, bookId: string): BookMeta | null {
  const metaPath = path.join(dataDir, bookId, '00_Config', 'book_meta.json')
  if (!fs.existsSync(metaPath)) return null
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as BookMeta
  } catch {
    return null
  }
}

export function createBook(dataDir: string, meta: BookMeta): BookMeta {
  const bookDir = path.join(dataDir, meta.book_id)

  if (fs.existsSync(bookDir)) {
    throw new Error(`Book '${meta.book_id}' already exists`)
  }

  // Create directory structure
  const dirs = [
    path.join(bookDir, '00_Config'),
    path.join(bookDir, '01_Global_Settings'),
    path.join(bookDir, '02_Outlines'),
    path.join(bookDir, 'memory'),
  ]
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true })
  }

  // Write metadata
  const withTimestamp: BookMeta = {
    ...meta,
    created_at: meta.created_at || new Date().toISOString(),
  }
  const metaPath = path.join(bookDir, '00_Config', 'book_meta.json')
  fs.writeFileSync(metaPath, JSON.stringify(withTimestamp, null, 2), 'utf-8')

  return withTimestamp
}

export function deleteBook(dataDir: string, bookId: string): void {
  const bookDir = path.join(dataDir, bookId)
  if (!fs.existsSync(bookDir)) {
    throw new Error(`Book '${bookId}' not found`)
  }
  fs.rmSync(bookDir, { recursive: true, force: true })
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

    // Scan outlines for chapters
    const outlinePath = path.join(bookDir, '02_Outlines', 'outline.json')
    if (fs.existsSync(outlinePath)) {
      try {
        const outline = JSON.parse(fs.readFileSync(outlinePath, 'utf-8'))
        if (outline.children) {
          for (const vol of outline.children) {
            children.push(scanOutlineNode(vol))
          }
        }
      } catch { /* ignore parse errors */ }
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
      const book = getBook(dataDir(), request.params.bookId)
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
        const book = createBook(dataDir(), request.body)
        reply.code(201)
        return book
      } catch (err: any) {
        reply.code(409)
        return { error: err.message }
      }
    }
  )

  // DELETE /api/v1/books/:bookId — delete book directory
  app.delete<{ Params: { bookId: string } }>(
    '/api/v1/books/:bookId',
    async (request, reply) => {
      try {
        deleteBook(dataDir(), request.params.bookId)
        return { status: 'ok' }
      } catch (err: any) {
        reply.code(404)
        return { error: err.message }
      }
    }
  )
}
