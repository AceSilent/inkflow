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
  // Seed a draft large enough for editorial review.
  fs.writeFileSync(path.join(dir, 'ch01.md'), 'A'.repeat(2600), 'utf8')
  fs.writeFileSync(path.join(dir, 'ch02.md'), 'A'.repeat(900), 'utf8')
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

  it('returns 400 when draft is shorter than editorial minimum', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/books/book1/chapters/ch02/resubmit-review',
    })
    expect(r.statusCode).toBe(400)
    const body = JSON.parse(r.payload)
    expect(body.code).toBe('DRAFT_TOO_SHORT_FOR_REVIEW')
    expect(body.minimum_chars).toBe(2500)
  })

  it('blocks severe local self-check failures before running editorial', async () => {
    const draft = [
      '手机彻底没信号，指南针在屏幕中央乱转。',
      '林星撑着地板坐起来，剧烈喘息了两口。冷汗浸透了后背的冲锋衣，贴着皮肤发凉。',
      '他低头快速扫了一遍。没骨折，没大出血，只是摔下来的钝伤还在神经上跳。',
      '他闭眼缓了五秒，把喉咙里的土腥味咽下去。再睁眼时，视线已经能聚焦。',
      '不是他租的公寓。也不是市郊那条铺了柏油的登山道。',
      '霉味和干草的腥气混在一起，直往鼻腔里钻。头顶的木板漏了个洞，阳光斜切进来，照出空气里浮动的灰尘。',
      '林星低头检查装备。背包带子还勒在肩上，鞋底沾着暗绿色的苔藓。',
      '他撑着膝盖站起来，腿肚子还在抖。拍了拍裤子上的灰，环顾四周。',
      '屋子不大。前厅空荡荡的，几张歪倒的木椅，一个裂了缝的柜台。',
      '培育屋。',
      '林星吸了口冷气。霉味说明通风极差，这种老木结构一旦受潮，墙板缝隙里绝对藏着毒虫和霉菌孢子。他得在天黑前确认这地方的结构安全，顺便找点干净的水。',
      '正文推进。'.repeat(900),
    ].join('\n\n')
    fs.writeFileSync(path.join(tmpDir, 'book1', '04_Drafts', 'ch01.md'), draft, 'utf8')

    const runMock = vi.fn()
    vi.doMock('../src/editorial/editorial.js', async () => {
      const real = await vi.importActual<typeof import('../src/editorial/editorial.js')>(
        '../src/editorial/editorial.js',
      )
      return { ...real, runEditorialPipelineForChapter: runMock }
    })

    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/books/book1/chapters/ch01/resubmit-review',
    })

    expect(r.statusCode).toBe(400)
    const body = JSON.parse(r.payload)
    expect(body.code).toBe('DRAFT_SELF_CHECK_FAILED')
    expect(body.message).toContain('Opening_Camera_Blocking_Density')
    expect(runMock).not.toHaveBeenCalled()
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

  it('passes requested review scope through to the editorial helper', async () => {
    const runMock = vi.fn().mockResolvedValue({
      overall_pass: false,
      feedbacks: [],
      merged_summary: 'ok',
      revision_round: 2,
      persistent_issues: [],
    })
    vi.doMock('../src/editorial/editorial.js', async () => {
      const real = await vi.importActual<typeof import('../src/editorial/editorial.js')>(
        '../src/editorial/editorial.js',
      )
      return { ...real, runEditorialPipelineForChapter: runMock }
    })

    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/books/book1/chapters/ch01/resubmit-review',
      payload: { review_scope: 'failed_only' },
    })

    expect(r.statusCode).toBe(200)
    expect(runMock).toHaveBeenCalledWith(expect.objectContaining({
      reviewScope: 'failed_only',
      resetAutoRevisionBudget: true,
    }))
  })
})
