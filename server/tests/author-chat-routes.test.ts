/**
 * Tests for author-chat route helpers — history load/save/clear + path sanitization.
 *
 * Note: SSE streaming tests require a running Fastify server with mock LLM.
 * These tests focus on the helper functions that can be tested in isolation.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { sanitizePathSegment } from '../src/utils/path-sanitizer.js'
import { sendChatBody } from '../src/routes/schemas.js'

const TEST_DIR = path.join(process.cwd(), '__test_author_chat__')

function cleanDir(): void {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true })
  }
}

beforeEach(() => {
  cleanDir()
  fs.mkdirSync(TEST_DIR, { recursive: true })
})

afterEach(() => {
  cleanDir()
})

// ── History file helpers (same logic as author-chat.ts) ──

function historyPath(dataDir: string, bookId: string): string {
  const dir = path.join(dataDir, bookId)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, 'author_chat_history.json')
}

function loadHistory(dataDir: string, bookId: string): Array<{ role: string; content: string }> {
  const p = historyPath(dataDir, bookId)
  if (!fs.existsSync(p)) return []
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8'))
    return raw
      .filter((m: { role: string }) => m.role === 'user' || m.role === 'assistant')
      .slice(-20)
  } catch {
    return []
  }
}

function saveHistory(dataDir: string, bookId: string, messages: Array<{ role: string; content: string }>): void {
  const p = historyPath(dataDir, bookId)
  const trimmed = messages.slice(-50)
  fs.writeFileSync(p, JSON.stringify(trimmed, null, 2), 'utf-8')
}

describe('Author Chat History', () => {
  it('should return empty array when no history file exists', () => {
    const history = loadHistory(TEST_DIR, 'book-1')
    expect(history).toEqual([])
  })

  it('should save and load history roundtrip', () => {
    const messages = [
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '你好！有什么可以帮助你的？' },
      { role: 'user', content: '帮我写一个开头' },
      { role: 'assistant', content: '好的，我来写...' },
    ]
    saveHistory(TEST_DIR, 'book-1', messages)

    const loaded = loadHistory(TEST_DIR, 'book-1')
    expect(loaded).toHaveLength(4)
    expect(loaded[0]).toEqual({ role: 'user', content: '你好' })
    expect(loaded[3]).toEqual({ role: 'assistant', content: '好的，我来写...' })
  })

  it('should filter to only user/assistant messages', () => {
    const messages = [
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'hello' },
      { role: 'tool', content: 'tool result' },
      { role: 'assistant', content: 'response' },
    ]
    saveHistory(TEST_DIR, 'book-2', messages)

    const loaded = loadHistory(TEST_DIR, 'book-2')
    expect(loaded).toHaveLength(2)
    expect(loaded[0].role).toBe('user')
    expect(loaded[1].role).toBe('assistant')
  })

  it('should trim to last 20 messages on load', () => {
    const messages = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i}`,
    }))
    saveHistory(TEST_DIR, 'book-3', messages)

    const loaded = loadHistory(TEST_DIR, 'book-3')
    expect(loaded).toHaveLength(20)
    expect(loaded[0].content).toBe('Message 10')
    expect(loaded[19].content).toBe('Message 29')
  })

  it('should trim to last 50 messages on save', () => {
    const messages = Array.from({ length: 60 }, (_, i) => ({
      role: 'user',
      content: `Msg ${i}`,
    }))
    saveHistory(TEST_DIR, 'book-4', messages)

    // Read raw file to verify 50 saved
    const raw = JSON.parse(fs.readFileSync(historyPath(TEST_DIR, 'book-4'), 'utf-8'))
    expect(raw).toHaveLength(50)
  })

  it('should clear history by saving empty array', () => {
    saveHistory(TEST_DIR, 'book-5', [
      { role: 'user', content: 'test' },
      { role: 'assistant', content: 'reply' },
    ])

    saveHistory(TEST_DIR, 'book-5', [])
    const loaded = loadHistory(TEST_DIR, 'book-5')
    expect(loaded).toEqual([])
  })

  it('should create book directory if missing', () => {
    const bookDir = path.join(TEST_DIR, 'new-book')
    expect(fs.existsSync(bookDir)).toBe(false)

    saveHistory(TEST_DIR, 'new-book', [
      { role: 'user', content: 'hi' },
    ])

    expect(fs.existsSync(bookDir)).toBe(true)
    expect(fs.existsSync(historyPath(TEST_DIR, 'new-book'))).toBe(true)
  })

  it('should handle corrupted history file gracefully', () => {
    const p = historyPath(TEST_DIR, 'corrupt')
    fs.writeFileSync(p, 'not valid json {{{', 'utf-8')

    const loaded = loadHistory(TEST_DIR, 'corrupt')
    expect(loaded).toEqual([])
  })
})

describe('Author Chat Path Sanitization', () => {
  it('should reject path traversal in bookId', () => {
    expect(() => sanitizePathSegment('../etc/passwd', 'bookId')).toThrow()
  })

  it('should reject absolute path in bookId', () => {
    expect(() => sanitizePathSegment('C:\\Windows\\System32', 'bookId')).toThrow()
  })

  it('should accept valid bookId for history operations', () => {
    expect(() => sanitizePathSegment('my-book-123', 'bookId')).not.toThrow()
    expect(() => sanitizePathSegment('测试小说', 'bookId')).not.toThrow()
  })
})

describe('Author Chat Schema Validation', () => {
  it('should accept valid send body', () => {
    const result = sendChatBody.safeParse({ message: '帮我写一段打斗场景' })
    expect(result.success).toBe(true)
  })

  it('should accept brainstorm mode', () => {
    const result = sendChatBody.safeParse({ message: '头脑风暴', mode: 'brainstorm' })
    expect(result.success).toBe(true)
  })

  it('should reject empty message', () => {
    const result = sendChatBody.safeParse({ message: '' })
    expect(result.success).toBe(false)
  })

  it('should reject invalid mode', () => {
    const result = sendChatBody.safeParse({ message: 'hi', mode: 'invalid_mode' })
    expect(result.success).toBe(false)
  })
})
