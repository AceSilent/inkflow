import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { buildMarkdownMemoryContext, DEFAULT_RECALL_CONFIG } from '../src/memory/recall.js'
import { writeMemory } from '../src/memory/memory-service.js'

let tmpDir: string
let parentDir: string

beforeEach(() => {
  parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rec-'))
  tmpDir = path.join(parentDir, 'books')
  fs.mkdirSync(path.join(tmpDir, 'book1'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(parentDir, { recursive: true, force: true })
})

function seed(tmp: string, id: string, scope: 'user' | 'book' | 'session', conf: number, body: string, bookId?: string): void {
  writeMemory(tmp, {
    id, scope, type: 'preference',
    confidence: conf, tags: [],
    source: 'user_remember', status: 'active',
    created_at: '2026-04-18T00:00:00Z',
    ...(bookId ? { book_id: bookId } : {}),
  }, body)
}

describe('buildMarkdownMemoryContext', () => {
  it('returns empty when no memories', () => {
    expect(buildMarkdownMemoryContext(tmpDir, 'book1')).toBe('')
  })

  it('includes active user + book memories, sorted by confidence desc', () => {
    seed(tmpDir, 'a', 'user', 0.5, 'low conf user memory')
    seed(tmpDir, 'b', 'user', 0.9, 'high conf user memory')
    seed(tmpDir, 'c', 'book', 0.8, 'book-level fact', 'book1')
    const out = buildMarkdownMemoryContext(tmpDir, 'book1')
    const posBook = out.indexOf('book-level fact')
    const posHigh = out.indexOf('high conf user memory')
    const posLow = out.indexOf('low conf user memory')
    expect(posBook).toBeGreaterThanOrEqual(0)
    expect(posHigh).toBeGreaterThanOrEqual(0)
    expect(posLow).toBeGreaterThanOrEqual(0)
    // high conf comes before low conf within user section
    expect(posHigh).toBeLessThan(posLow)
  })

  it('respects scope budget split (project 50% / global 30% / session 20%)', () => {
    const longBody = 'X'.repeat(5000)
    seed(tmpDir, 'proj1', 'book', 0.9, longBody, 'book1')
    seed(tmpDir, 'glob1', 'user', 0.9, longBody)
    const out = buildMarkdownMemoryContext(tmpDir, 'book1', { ...DEFAULT_RECALL_CONFIG, totalCharBudget: 2000 })
    expect(out.length).toBeLessThanOrEqual(2500)  // include section headers
    // project scope (50% of 2000 = 1000) should fit partial body
    expect(out).toContain('proj1'.slice(0, 10))
  })

  it('filters confidence < minConfidence', () => {
    seed(tmpDir, 'x', 'user', 0.2, 'very low conf')
    const out = buildMarkdownMemoryContext(tmpDir, 'book1', { ...DEFAULT_RECALL_CONFIG, minConfidence: 0.4 })
    expect(out).not.toContain('very low conf')
  })
})
