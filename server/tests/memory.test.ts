import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { loadCoreMemory, getWritingPrinciples, saveCoreMemoryFile } from '../src/memory/core-memory.js'
import { loadProjectMemory, updateDecidedFacts, updatePlotProgress } from '../src/memory/project-memory.js'
import { buildMemoryContext } from '../src/memory/context-builder.js'

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
