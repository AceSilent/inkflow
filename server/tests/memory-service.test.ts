import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  writeMemory,
  readMemory,
  listMemories,
  moveMemory,
  deleteMemory,
  rewriteIndex,
} from '../src/memory/memory-service.js'
import type { MemoryFrontmatter } from '../src/memory/markdown-io.js'

let tmpDir: string
let parentDir: string

beforeEach(() => {
  parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mem-'))
  tmpDir = path.join(parentDir, 'books')
  fs.mkdirSync(path.join(tmpDir, 'book1'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(parentDir, { recursive: true, force: true })
})

function sampleFrontmatter(overrides: Partial<MemoryFrontmatter> = {}): MemoryFrontmatter {
  return {
    id: 'mem_test', scope: 'user', type: 'preference',
    confidence: 0.8, tags: [], source: 'auto_extract',
    status: 'pending', created_at: '2026-04-18T00:00:00Z',
    ...overrides,
  }
}

describe('memory-service', () => {
  it('writeMemory creates file under _pending', () => {
    const fm = sampleFrontmatter()
    const filePath = writeMemory(tmpDir, fm, 'body')
    expect(filePath).toContain('_pending')
    expect(fs.existsSync(filePath)).toBe(true)
  })

  it('writeMemory under active scope=user goes to user_preferences', () => {
    const fm = sampleFrontmatter({ status: 'active', type: 'preference' })
    const filePath = writeMemory(tmpDir, fm, 'body')
    expect(filePath).toContain('user_preferences')
  })

  it('writeMemory under book scope writes to books/{bookId}/memories', () => {
    const fm = sampleFrontmatter({ scope: 'book', status: 'active', book_id: 'book1' })
    const filePath = writeMemory(tmpDir, fm, 'body')
    expect(filePath).toContain(path.join('book1', 'memories'))
  })

  it('listMemories(pending) returns all _pending entries', () => {
    writeMemory(tmpDir, sampleFrontmatter({ id: 'a' }), 'a')
    writeMemory(tmpDir, sampleFrontmatter({ id: 'b' }), 'b')
    const list = listMemories(tmpDir, 'pending')
    expect(list).toHaveLength(2)
    expect(list.map(m => m.frontmatter.id).sort()).toEqual(['a', 'b'])
  })

  it('moveMemory from _pending to active', async () => {
    const fm = sampleFrontmatter({ id: 'c', status: 'pending' })
    writeMemory(tmpDir, fm, 'body')
    await moveMemory(tmpDir, 'c', 'active')
    const pending = listMemories(tmpDir, 'pending')
    expect(pending.find(m => m.frontmatter.id === 'c')).toBeUndefined()
    const active = listMemories(tmpDir, 'active')
    expect(active.find(m => m.frontmatter.id === 'c')?.frontmatter.status).toBe('active')
  })

  it('deleteMemory removes file', async () => {
    writeMemory(tmpDir, sampleFrontmatter({ id: 'd' }), 'x')
    await deleteMemory(tmpDir, 'd')
    const list = listMemories(tmpDir, 'pending')
    expect(list.find(m => m.frontmatter.id === 'd')).toBeUndefined()
  })

  it('rewriteIndex creates MEMORY.md listing active memories', () => {
    writeMemory(tmpDir, sampleFrontmatter({ id: 'e', status: 'active', type: 'preference' }), '# title\nbody')
    rewriteIndex(tmpDir, 'user_preferences')
    const indexPath = path.join(parentDir, 'global', 'memories', 'user_preferences', 'MEMORY.md')
    const content = fs.readFileSync(indexPath, 'utf8')
    expect(content).toContain('e.md')
  })
})
