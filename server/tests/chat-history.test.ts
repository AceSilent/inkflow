import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { loadHistoryFull, saveHistory, truncateHistoryAtMessage } from '../src/routes/chat-history.js'

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

  it('loadHistoryFull preserves system summaries and filters unsupported tool messages', () => {
    saveHistory(tmpDir, 'book1', [
      { role: 'system', content: 'compacted summary' } as any,
      { role: 'user', content: 'hello' },
      { role: 'tool', content: 'tool result' } as any,
      { role: 'assistant', content: 'response' },
    ])

    const loaded = loadHistoryFull(tmpDir, 'book1')
    expect(loaded.map(m => m.role)).toEqual(['system', 'user', 'assistant'])
    expect(loaded[0].content).toBe('compacted summary')
  })

  it('truncateHistoryAtMessage returns original messages unchanged when the id is missing', () => {
    const messages = [
      { role: 'system' as const, content: 'summary' },
      { role: 'user' as const, content: 'first', id: 'm1' },
      { role: 'assistant' as const, content: 'reply' },
    ]

    const truncated = truncateHistoryAtMessage(messages, 'missing', 'edited')

    expect(truncated).toBe(messages)
  })
})
