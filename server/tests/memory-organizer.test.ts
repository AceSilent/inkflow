import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { buildMemoryContext } from '../src/memory/context-builder.js'
import { listMemories, readMemory, writeMemory } from '../src/memory/memory-service.js'
import { organizePendingMemories } from '../src/memory/organizer.js'
import type { MemoryFrontmatter } from '../src/memory/markdown-io.js'

let parentDir: string
let dataDir: string
const bookId = 'book1'

beforeEach(() => {
  parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-organizer-'))
  dataDir = path.join(parentDir, 'books')
  fs.mkdirSync(path.join(dataDir, bookId), { recursive: true })
})

afterEach(() => {
  fs.rmSync(parentDir, { recursive: true, force: true })
})

function fm(overrides: Partial<MemoryFrontmatter>): MemoryFrontmatter {
  return {
    id: 'mem_test',
    scope: 'book',
    type: 'preference',
    confidence: 0.9,
    tags: [],
    source: 'auto_extract',
    status: 'pending',
    created_at: '2026-06-08T00:00:00.000Z',
    book_id: bookId,
    ...overrides,
  }
}

function countOccurrences(text: string, needle: string): number {
  return text.split(needle).length - 1
}

describe('memory organizer', () => {
  it('merges high-confidence pending book memories into digest cards and archives the originals', async () => {
    writeMemory(dataDir, fm({
      id: 'mem_book1_migration_style',
      status: 'active',
      source: 'user_remember',
      source_event: 'migration_digest',
      tags: ['migration_digest', 'style'],
      created_at: '2026-06-07T00:00:00.000Z',
      approved_at: '2026-06-07T00:00:00.000Z',
    }), '# 迁移记忆：作者偏好与协作方式\n\n- 旧偏好：先讨论，再落盘正文。')

    writeMemory(dataDir, fm({
      id: 'mem_pending_style_latest',
      type: 'preference',
      confidence: 0.96,
      tags: ['AI腔', '白描'],
      created_at: '2026-06-08T00:00:02.000Z',
    }), '# 现场观察语感\n\n用户不喜欢堆比喻、解释和人工抒情；案发现场应优先使用物理白描与视线流。')
    writeMemory(dataDir, fm({
      id: 'mem_pending_plot_latest',
      type: 'plot_note',
      confidence: 0.94,
      tags: ['第一章', '线索'],
      created_at: '2026-06-08T00:00:01.000Z',
    }), '# 第一章死者与酒馆线索\n\n死者口袋空无一物，不能再使用“没抽完的烟”；可用没有酒味、附近没有酒馆作为推理线索。')
    writeMemory(dataDir, fm({
      id: 'mem_pending_low',
      type: 'plot_note',
      confidence: 0.5,
      tags: ['低置信'],
    }), '# 模糊线索\n\n这条不应自动合并。')

    const result = await organizePendingMemories(dataDir, bookId)

    expect(result.processed).toBe(2)
    expect(result.archived).toBe(2)
    expect(result.updatedDigests).toBe(1)
    expect(result.createdDigests).toBe(1)
    expect(result.skippedLowConfidence).toBe(1)

    const pendingIds = listMemories(dataDir, 'pending').map(entry => entry.frontmatter.id)
    expect(pendingIds).toEqual(['mem_pending_low'])
    const archivedIds = listMemories(dataDir, 'archived').map(entry => entry.frontmatter.id)
    expect(archivedIds).toEqual(expect.arrayContaining(['mem_pending_style_latest', 'mem_pending_plot_latest']))

    const styleDigest = readMemory(dataDir, 'mem_book1_migration_style')
    expect(styleDigest?.body).toContain('现场观察语感')
    expect(styleDigest?.body).toContain('旧偏好')
    expect(styleDigest?.body.indexOf('现场观察语感')).toBeLessThan(styleDigest?.body.indexOf('旧偏好') ?? Infinity)

    const outlineDigest = readMemory(dataDir, 'mem_book1_migration_outline')
    expect(outlineDigest?.body).toContain('没有酒味')
    expect(outlineDigest?.body).toContain('附近没有酒馆')

    const context = buildMemoryContext(dataDir, bookId)
    expect(context).toContain('用户不喜欢堆比喻')
    expect(context).toContain('没有酒味')
  })

  it('is idempotent after pending memories have been archived', async () => {
    writeMemory(dataDir, fm({
      id: 'mem_pending_style_latest',
      type: 'preference',
      confidence: 0.95,
      tags: ['AI腔'],
    }), '# 现场观察语感\n\n避免旁白讲解，先看前文再反馈。')

    await organizePendingMemories(dataDir, bookId)
    const second = await organizePendingMemories(dataDir, bookId)

    expect(second.processed).toBe(0)
    const styleDigest = readMemory(dataDir, 'mem_book1_migration_style')
    expect(countOccurrences(styleDigest?.body ?? '', '现场观察语感')).toBe(1)
  })

  it('prioritizes recent corrections over older higher-confidence memories inside a digest', async () => {
    writeMemory(dataDir, fm({
      id: 'mem_pending_plot_old',
      type: 'plot_note',
      confidence: 1,
      tags: ['第一章'],
      created_at: '2026-06-07T00:00:00.000Z',
    }), '# 旧版第一章线索\n\n旧线索需要保留但不应压过最新纠正。')
    writeMemory(dataDir, fm({
      id: 'mem_pending_plot_new',
      type: 'plot_note',
      confidence: 0.9,
      tags: ['第一章', '酒馆'],
      created_at: '2026-06-08T00:00:00.000Z',
    }), '# 最新酒馆线索\n\n死者没有酒味，附近没有酒馆，不能使用没抽完的烟。')

    await organizePendingMemories(dataDir, bookId)

    const outlineDigest = readMemory(dataDir, 'mem_book1_migration_outline')
    expect(outlineDigest?.body.indexOf('最新酒馆线索')).toBeLessThan(outlineDigest?.body.indexOf('旧版第一章线索') ?? Infinity)
    expect(buildMemoryContext(dataDir, bookId)).toContain('附近没有酒馆')
  })

  it('classifies discussion workflow memories as collaboration style memory', async () => {
    writeMemory(dataDir, fm({
      id: 'mem_pending_workflow',
      type: 'discussion',
      confidence: 0.8,
      tags: ['工作流', '协同创作'],
    }), '# 修改前需先阅读用户改动\n\n用户对前文进行了大量自主修改。进行下一步或任何修改前，助手需要先读取并查看用户的实际修改，不能直接覆盖或盲目修改。')

    const result = await organizePendingMemories(dataDir, bookId)

    expect(result.processed).toBe(1)
    expect(readMemory(dataDir, 'mem_book1_migration_style')?.body).toContain('不能直接覆盖')
  })
})
