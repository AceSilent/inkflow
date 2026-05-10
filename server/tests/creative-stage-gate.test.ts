import { describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { creativeStageGate } from '../src/stats/tips/creative-stage-gate.js'
import { type RuleContext } from '../src/stats/tips/types.js'

function makeCtx(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    dataDir: 'missing-data-dir',
    bookId: 'missing-book',
    callsThisStream: new Map(),
    lastArgs: new Map(),
    emitted: new Set(),
    emit: vi.fn(),
    ...overrides,
  }
}

describe('creativeStageGate', () => {
  it('blocks drafting before staged preconditions are ready', () => {
    const ctx = makeCtx()
    const result = creativeStageGate(ctx).interceptToolCall?.('save_draft', { file_path: 'ch01.md' }, { dataDir: ctx.dataDir, bookId: ctx.bookId })
    expect(result).toMatchObject({ block: true })
    expect(result?.message).toContain('正文阶段条件不足')
  })

  it('blocks review when no first draft exists', () => {
    const ctx = makeCtx()
    const result = creativeStageGate(ctx).interceptToolCall?.('submit_to_editorial', { chapter_id: 'ch01' }, { dataDir: ctx.dataDir, bookId: ctx.bookId })
    expect(result).toMatchObject({ block: true })
    expect(result?.message).toContain('没有 ch01 草稿')
  })

  it('blocks review for the requested chapter when a previous draft exists', () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'creative-stage-gate-'))
    try {
      const bookDir = path.join(dataDir, 'book1')
      fs.mkdirSync(path.join(bookDir, '04_Drafts'), { recursive: true })
      fs.writeFileSync(path.join(bookDir, '04_Drafts', 'ch01.md'), '正文')
      const ctx = makeCtx({ dataDir, bookId: 'book1' })

      const result = creativeStageGate(ctx).interceptToolCall?.(
        'submit_to_editorial',
        { chapter_id: 'ch02' },
        { dataDir: ctx.dataDir, bookId: ctx.bookId },
      )

      expect(result).toMatchObject({ block: true })
      expect(result?.message).toContain('没有 ch02 草稿')
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('caps plot node expansion per stream', () => {
    const ctx = makeCtx({ callsThisStream: new Map([['add_plot_node', 12]]) })
    const result = creativeStageGate(ctx).interceptToolCall?.('add_plot_node', { id: 'n13' }, { dataDir: ctx.dataDir, bookId: ctx.bookId })
    expect(result).toMatchObject({ block: true })
    expect(result?.message).toContain('新增剧情节点过多')
  })

  it('caps plot edge expansion per stream', () => {
    const ctx = makeCtx({ callsThisStream: new Map([['add_edge', 16]]) })
    const result = creativeStageGate(ctx).interceptToolCall?.('add_edge', { id: 'e17' }, { dataDir: ctx.dataDir, bookId: ctx.bookId })
    expect(result).toMatchObject({ block: true })
    expect(result?.message).toContain('新增剧情边过多')
  })
})
