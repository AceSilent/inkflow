import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { buildMemoryContext } from '../src/memory/context-builder.js'
import { writeMemory } from '../src/memory/memory-service.js'

let parentDir: string
let tmpDir: string

beforeEach(() => {
  parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-'))
  tmpDir = path.join(parentDir, 'books')
  fs.mkdirSync(path.join(tmpDir, 'book1'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(parentDir, { recursive: true, force: true })
})

describe('buildMemoryContext markdown integration', () => {
  it('surfaces active markdown memory', () => {
    writeMemory(tmpDir, {
      id: 'm', scope: 'user', type: 'preference',
      confidence: 0.9, tags: [], source: 'user_remember',
      status: 'active', created_at: '2026-04-18T00:00:00Z',
    }, '主角不能哭')
    const out = buildMemoryContext(tmpDir, 'book1')
    expect(out).toContain('主角不能哭')
  })
})
