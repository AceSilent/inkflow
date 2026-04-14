import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { loadCoreMemory, getWritingPrinciples, saveCoreMemoryFile } from '../src/memory/core-memory.js'
import {
  loadProjectMemory,
  updateDecidedFacts,
  updatePlotProgress,
  updateCharacterStates,
  CHARACTER_STATE_HISTORY,
} from '../src/memory/project-memory.js'
import {
  buildMemoryContext,
  formatPlotProgressTiered,
  formatCharacterStatesTiered,
} from '../src/memory/context-builder.js'

describe('Core Memory', () => {
  let tmpBase: string
  let tmpDir: string

  beforeEach(() => {
    tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'mem-'))
    tmpDir = path.join(tmpBase, 'data')
    fs.mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(tmpBase, { recursive: true })
  })

  it('should return empty when no files exist', () => {
    const core = loadCoreMemory(tmpDir)
    expect(Object.keys(core)).toHaveLength(0)
  })

  it('should save and load writing principles', () => {
    const principles = [
      { principle: '动作泄密而非旁白告知', confidence: 0.9 },
      { principle: '一段只许一个特写', confidence: 0.8 },
    ]
    saveCoreMemoryFile(tmpDir, 'writing_principles.json', principles)

    const loaded = getWritingPrinciples(tmpDir)
    expect(loaded).toHaveLength(2)
    expect(loaded[0].principle).toBe('动作泄密而非旁白告知')
    expect(loaded[0].confidence).toBe(0.9)
  })

  it('should sort principles by confidence descending', () => {
    const principles = [
      { principle: 'low', confidence: 0.3 },
      { principle: 'high', confidence: 0.95 },
      { principle: 'mid', confidence: 0.7 },
    ]
    saveCoreMemoryFile(tmpDir, 'writing_principles.json', principles)

    const loaded = getWritingPrinciples(tmpDir)
    expect(loaded[0].principle).toBe('high')
    expect(loaded[2].principle).toBe('low')
  })
})

describe('Project Memory', () => {
  let tmpBase: string
  let tmpDir: string

  beforeEach(() => {
    tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'mem-'))
    tmpDir = path.join(tmpBase, 'data')
    fs.mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(tmpBase, { recursive: true })
  })

  it('should return empty for new book', () => {
    const mem = loadProjectMemory(tmpDir, 'new-book')
    expect(Object.keys(mem)).toHaveLength(0)
  })

  it('should update decided facts (append-only merge)', () => {
    updateDecidedFacts(tmpDir, 'book1', { '主角名': '萧炎', '世界': '斗气大陆' })
    updateDecidedFacts(tmpDir, 'book1', { '等级': '斗帝' })

    const mem = loadProjectMemory(tmpDir, 'book1')
    const facts = mem.decided_facts as Record<string, string>
    expect(facts['主角名']).toBe('萧炎')
    expect(facts['等级']).toBe('斗帝')
  })

  it('should track plot progress', () => {
    updatePlotProgress(tmpDir, 'book1', 'ch1', '萧炎废材被嘲笑')
    updatePlotProgress(tmpDir, 'book1', 'ch2', '药老苏醒')

    const mem = loadProjectMemory(tmpDir, 'book1')
    const progress = mem.plot_progress as Array<{ chapter_id: string; summary: string }>
    expect(progress).toHaveLength(2)
    expect(progress[0].chapter_id).toBe('ch1')
    expect(progress[1].summary).toContain('药老')
  })

  it('should overwrite plot progress entry on repeat chapter_id (no duplicates)', () => {
    updatePlotProgress(tmpDir, 'book1', 'ch1', '初版摘要')
    updatePlotProgress(tmpDir, 'book1', 'ch2', '另一章')
    // Same chapter resubmitted after revision — should replace, not append.
    updatePlotProgress(tmpDir, 'book1', 'ch1', '修订版摘要')

    const mem = loadProjectMemory(tmpDir, 'book1')
    const progress = mem.plot_progress as Array<{ chapter_id: string; summary: string }>
    expect(progress).toHaveLength(2)
    const ch1 = progress.find(p => p.chapter_id === 'ch1')
    expect(ch1?.summary).toBe('修订版摘要')
  })

  it('should track character states with rolling history per character', () => {
    updateCharacterStates(tmpDir, 'book1', 'ch1', { 林辰: '重生归来，决心隐忍' })
    updateCharacterStates(tmpDir, 'book1', 'ch2', { 林辰: '初遇苏婉', 苏婉: '困惑于林辰反常' })

    const mem = loadProjectMemory(tmpDir, 'book1')
    const states = mem.character_states as Record<string, Array<{ chapter_id: string; state: string }>>
    expect(states['林辰']).toHaveLength(2)
    expect(states['苏婉']).toHaveLength(1)
    expect(states['林辰'][1].state).toContain('初遇')
  })

  it('should cap character history at CHARACTER_STATE_HISTORY (drop oldest)', () => {
    for (let i = 1; i <= CHARACTER_STATE_HISTORY + 3; i++) {
      updateCharacterStates(tmpDir, 'book1', `ch${String(i).padStart(2, '0')}`, {
        林辰: `state-${i}`,
      })
    }
    const mem = loadProjectMemory(tmpDir, 'book1')
    const states = mem.character_states as Record<string, Array<{ chapter_id: string; state: string }>>
    expect(states['林辰']).toHaveLength(CHARACTER_STATE_HISTORY)
    // Oldest should be ch04 (1+3 = 4 dropped chapters before ch04 since cap=5 → kept ch04..ch08 if N=8)
    expect(states['林辰'][0].state).toBe(`state-${CHARACTER_STATE_HISTORY + 3 - CHARACTER_STATE_HISTORY + 1}`)
    expect(states['林辰'].at(-1)!.state).toBe(`state-${CHARACTER_STATE_HISTORY + 3}`)
  })

  it('should ignore empty character_states map', () => {
    updateCharacterStates(tmpDir, 'book1', 'ch1', {})
    const mem = loadProjectMemory(tmpDir, 'book1')
    expect(mem.character_states).toBeUndefined()
  })
})

describe('Memory Context Builder', () => {
  let tmpBase: string
  let tmpDir: string

  beforeEach(() => {
    tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'mem-'))
    tmpDir = path.join(tmpBase, 'data')
    fs.mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(tmpBase, { recursive: true })
  })

  it('should return empty string when no memory exists', () => {
    const ctx = buildMemoryContext(tmpDir, 'empty-book')
    expect(ctx).toBe('')
  })

  describe('Tiered plot progress', () => {
    it('shows full summary for ≤5 chapters', () => {
      const progress = Array.from({ length: 4 }, (_, i) => ({
        chapter_id: `ch0${i + 1}`,
        summary: `chapter ${i + 1} full summary text here`,
      }))
      const out = formatPlotProgressTiered(progress)
      expect(out).toContain('最近 4 章全摘要')
      expect(out).not.toContain('更早')
      for (const p of progress) expect(out).toContain(p.summary)
    })

    it('separates older chapters into single-line trail', () => {
      const progress = Array.from({ length: 8 }, (_, i) => ({
        chapter_id: `ch0${i + 1}`,
        summary: `summary for chapter ${i + 1} ` + 'x'.repeat(80),
      }))
      const out = formatPlotProgressTiered(progress)
      expect(out).toContain('更早 3 章简写')
      expect(out).toContain('最近 5 章全摘要')
      // Older chapters truncated.
      expect(out).toContain('· ch01:')
      expect(out).toContain('…')
      // Recent five all present in full.
      for (let i = 4; i < 8; i++) {
        expect(out).toContain(`ch0${i + 1}: summary for chapter ${i + 1}`)
      }
    })

    it('drops chapters past the compact window from injection', () => {
      const progress = Array.from({ length: 30 }, (_, i) => ({
        chapter_id: `ch${String(i + 1).padStart(2, '0')}`,
        summary: `s${i + 1}`,
      }))
      const out = formatPlotProgressTiered(progress)
      // 30 chapters - 5 recent - 15 compact = 10 dropped.
      expect(out).toContain('最早 10 章已超出注入窗口')
      // ch01..ch10 should NOT appear; ch11..ch25 should be in compact tier.
      expect(out).not.toContain('ch01:')
      expect(out).toContain('ch11:')
      expect(out).toContain('ch30:')
    })
  })

  describe('Tiered character states', () => {
    it('inlines single-state characters', () => {
      const states = { 林辰: [{ chapter_id: 'ch01', state: 'just reborn' }] }
      const out = formatCharacterStatesTiered(states)
      expect(out).toBe('- 林辰 [ch01]: just reborn')
    })

    it('expands multi-state characters into bullet history', () => {
      const states = {
        林辰: [
          { chapter_id: 'ch01', state: 'reborn' },
          { chapter_id: 'ch02', state: 'plans revenge' },
          { chapter_id: 'ch03', state: 'meets master' },
        ],
      }
      const out = formatCharacterStatesTiered(states)
      expect(out).toContain('- 林辰:')
      expect(out).toContain('[ch01] reborn')
      expect(out).toContain('[ch03] meets master')
    })
  })

  it('should build context with both core and project memory', () => {
    // Set up core memory
    saveCoreMemoryFile(tmpDir, 'writing_principles.json', [
      { principle: '白描铁律', confidence: 0.9 },
    ])

    // Set up project memory
    updateDecidedFacts(tmpDir, 'book1', { '主角': '萧炎' })
    updatePlotProgress(tmpDir, 'book1', 'ch1', '废材开局')

    const ctx = buildMemoryContext(tmpDir, 'book1')
    expect(ctx).toContain('核心记忆·写作原则')
    expect(ctx).toContain('白描铁律')
    expect(ctx).toContain('项目记忆·已确定设定')
    expect(ctx).toContain('萧炎')
    expect(ctx).toContain('项目记忆·剧情进展')
    expect(ctx).toContain('废材开局')
  })
})
