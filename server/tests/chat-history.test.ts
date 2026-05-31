import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  bindSessionHistoryToBook,
  loadHistoryFull,
  loadSessionHistoryFull,
  saveHistory,
  saveSessionHistory,
  sessionHistoryPath,
  truncateHistoryAtMessage,
} from '../src/routes/chat-history.js'

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

  it('truncateHistoryAtMessage rejects non-user target messages even without replacement text', () => {
    const messages = [
      { role: 'user' as const, content: 'first', id: 'm1' },
      { role: 'assistant' as const, content: 'reply', id: 'a1' },
    ]

    expect(() => truncateHistoryAtMessage(messages, 'a1')).toThrow('not a user message')
  })

  it('stores unbound sessions outside book directories', () => {
    saveSessionHistory(tmpDir, 'session_alpha', [
      { role: 'user', content: '先聊一个雾港故事' },
      { role: 'assistant', content: '我们可以先确定主角和谜团。' },
    ])

    expect(sessionHistoryPath(tmpDir, 'session_alpha')).toContain(path.join('.sessions', 'session_alpha'))
    expect(loadSessionHistoryFull(tmpDir, 'session_alpha').map(m => m.content)).toEqual([
      '先聊一个雾港故事',
      '我们可以先确定主角和谜团。',
    ])
    expect(fs.existsSync(path.join(tmpDir, 'session_alpha', '00_Config'))).toBe(false)
  })

  it('can bind an unbound session into a newly created book history', () => {
    saveSessionHistory(tmpDir, 'session_to_bind', [
      { role: 'user', content: '我们先聊设定' },
      { role: 'assistant', content: '这会成为作品的创作记录。' },
    ])

    bindSessionHistoryToBook(tmpDir, 'session_to_bind', 'book1')

    expect(loadHistoryFull(tmpDir, 'book1').map(m => m.content)).toEqual([
      '我们先聊设定',
      '这会成为作品的创作记录。',
    ])
    expect(loadSessionHistoryFull(tmpDir, 'session_to_bind')).toEqual([])
  })
})
