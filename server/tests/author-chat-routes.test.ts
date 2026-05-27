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
import { persistUsageBestEffort } from '../src/routes/author-chat.js'
import { clearAuthorChatSession } from '../src/routes/author-chat-support.js'
import { appendRunEvent } from '../src/runs/run-timeline.js'
import { ReasoningSegmentAccumulator, type StreamSegmentEvent } from '../src/routes/stream-segments.js'
import { REASONING_CLOSE, REASONING_OPEN } from '../src/llm/provider.js'

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

describe('Author Chat Usage Persistence', () => {
  it('writes usage when it resolves with a positive token count', async () => {
    const usageFile = path.join(TEST_DIR, 'book-usage', 'last_usage.json')
    fs.mkdirSync(path.dirname(usageFile), { recursive: true })

    const result = await persistUsageBestEffort(Promise.resolve({ totalTokens: 123 }), usageFile, 20)

    expect(result).toBe('written')
    expect(JSON.parse(fs.readFileSync(usageFile, 'utf8'))).toEqual({ total_tokens: 123 })
  })

  it('times out instead of waiting forever for unresolved usage', async () => {
    const usageFile = path.join(TEST_DIR, 'book-timeout', 'last_usage.json')
    fs.mkdirSync(path.dirname(usageFile), { recursive: true })

    const started = Date.now()
    const result = await persistUsageBestEffort(new Promise(() => {}), usageFile, 20)

    expect(result).toBe('timeout')
    expect(Date.now() - started).toBeLessThan(500)
    expect(fs.existsSync(usageFile)).toBe(false)
  })
})

describe('Author Chat Session Clear', () => {
  it('clears history, timeline runs, usage, and context diagnostics', () => {
    const bookId = 'book-clear'
    const bookDir = path.join(TEST_DIR, bookId)
    fs.mkdirSync(bookDir, { recursive: true })
    saveHistory(TEST_DIR, bookId, [
      { role: 'user', content: 'test' },
      { role: 'assistant', content: 'reply' },
    ])
    appendRunEvent(TEST_DIR, bookId, {
      runId: 'run_20260425T120000_clear',
      seq: 1,
      ts: '2026-04-25T12:00:00.000Z',
      type: 'run_start',
      status: 'running',
      label: '开始',
    })
    fs.writeFileSync(path.join(bookDir, 'last_usage.json'), '{"total_tokens":123}', 'utf8')
    fs.writeFileSync(path.join(bookDir, 'context_log.jsonl'), '{"tier":"green"}\n', 'utf8')

    clearAuthorChatSession(TEST_DIR, bookId)

    expect(loadHistory(TEST_DIR, bookId)).toEqual([])
    expect(fs.existsSync(path.join(bookDir, 'runs'))).toBe(false)
    expect(fs.existsSync(path.join(bookDir, 'last_usage.json'))).toBe(false)
    expect(fs.existsSync(path.join(bookDir, 'context_log.jsonl'))).toBe(false)
  })
})

describe('Author Chat Stream Segment Accumulator', () => {
  it('splits content and thinking across partial reasoning markers', () => {
    const events: StreamSegmentEvent[] = []
    const acc = new ReasoningSegmentAccumulator((event) => events.push(event))

    acc.pushText(`正文A${REASONING_OPEN.slice(0, 3)}`)
    acc.pushText(`${REASONING_OPEN.slice(3)}思考${REASONING_CLOSE}正文B`, true)
    acc.finalize()

    expect(acc.fullText).toBe('正文A正文B')
    expect(acc.fullThinking).toBe('思考')
    expect(acc.segments).toEqual([
      { type: 'content', text: '正文A' },
      { type: 'thinking', text: '思考' },
      { type: 'content', text: '正文B' },
    ])
    expect(events.map(e => e.type)).toEqual([
      'content',
      'thinking_start',
      'thinking',
      'thinking_done',
      'content',
    ])
  })

  it('flushes open text before tool cards and updates tool results', () => {
    const events: StreamSegmentEvent[] = []
    const acc = new ReasoningSegmentAccumulator((event) => events.push(event))

    acc.pushText('开头正文')
    acc.flushForBoundary()
    acc.addToolCall('save_draft', { file_path: 'ch01.md' })
    acc.addToolResult('save_draft', 'ok')
    acc.pushText('结尾', true)
    acc.finalize()

    expect(acc.segments).toEqual([
      { type: 'content', text: '开头正文' },
      { type: 'tool_call', name: 'save_draft', argsPreview: '{"file_path":"ch01.md"}', status: 'done', result: 'ok' },
      { type: 'content', text: '结尾' },
    ])
    expect(events.map(e => e.type)).toEqual(['content', 'tool_start', 'tool_done', 'content'])
  })
})
