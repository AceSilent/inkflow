import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { loadHistoryFull, saveHistory } from '../src/routes/chat-history.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-'))
  fs.mkdirSync(path.join(tmpDir, 'book1'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('chat-history', () => {
  it('loadHistoryFull returns all saved messages (no slice)', () => {
    const msgs = Array.from({ length: 40 }, (_, i) => ({ role: 'user' as const, content: `m${i}` }))
    saveHistory(tmpDir, 'book1', msgs)
    const loaded = loadHistoryFull(tmpDir, 'book1')
    // saveHistory still caps at 50 for disk bloat protection; should return up to 50
    expect(loaded.length).toBe(40)
  })
})
