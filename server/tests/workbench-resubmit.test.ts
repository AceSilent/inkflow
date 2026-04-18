/**
 * Tests for POST /api/v1/books/:bookId/chapters/:chId/resubmit-review —
 * the human-driven "re-run editorial" entry point used by the chapter
 * workbench UI.
 *
 * We mock `runEditorialPipelineForChapter` via `vi.doMock` to avoid an actual
 * LLM round-trip. The route handler dynamic-imports the editorial module at
 * request time precisely so this per-test mock takes effect without needing
 * to clear Vitest's static-import cache.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { workbenchRoutes } from '../src/routes/workbench.js'

let app: FastifyInstance
let tmpDir: string

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wbr-'))
  const dir = path.join(tmpDir, 'book1', '04_Drafts')
  fs.mkdirSync(dir, { recursive: true })
  // Seed a draft large enough that the refactored helper won't reject it on length.
  fs.writeFileSync(path.join(dir, 'ch01.md'), 'A'.repeat(900), 'utf8')
  // Seed book_meta so lookups don't fail (route defaults to {} if absent, but
  // populating it exercises the happy path).
  fs.mkdirSync(path.join(tmpDir, 'book1', '00_Config'), { recursive: true })
  fs.writeFileSync(
    path.join(tmpDir, 'book1', '00_Config', 'book_meta.json'),
    JSON.stringify({ book_id: 'book1', title: 't', genre: 'g', tone: 'n' }),
  )

  app = Fastify()
  await app.register(workbenchRoutes, { prefix: '/api/v1', dataDir: tmpDir })
})

afterEach(async () => {
  await app.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
  vi.restoreAllMocks()
  vi.doUnmock('../src/editorial/editorial.js')
  vi.resetModules()
})

describe('resubmit-review', () => {
  it('returns 400 when draft file missing', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/books/book1/chapters/ch99/resubmit-review',
    })
    expect(r.statusCode).toBe(400)
  })

  it('returns 200 or 202 when draft exists (pipeline mocked)', async () => {
    // Mock the editorial pipeline module to avoid a real LLM call. The route
    // handler uses a dynamic `await import(...)` for this module, so
    // `vi.doMock` applied here takes effect for the upcoming request.
    vi.doMock('../src/editorial/editorial.js', async () => {
      const real = await vi.importActual<typeof import('../src/editorial/editorial.js')>(
        '../src/editorial/editorial.js',
      )
      return {
        ...real,
        runEditorialPipelineForChapter: vi.fn().mockResolvedValue({
          overall_pass: true,
          feedbacks: [],
          merged_summary: 'ok',
          revision_round: 1,
          persistent_issues: [],
        }),
      }
    })

    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/books/book1/chapters/ch01/resubmit-review',
    })
    expect([200, 202]).toContain(r.statusCode)
  })
})
