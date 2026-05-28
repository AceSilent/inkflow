import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import { tmpdir } from 'os'
import Fastify from 'fastify'
import type { ModelMessage } from 'ai'

const generateWithPtlRetryMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ text: '[MOCK ROUTE SUMMARY]', retries: 0 }),
)

vi.mock('../src/context/ptl-fallback.js', () => ({
  generateWithPtlRetry: generateWithPtlRetryMock,
  isPromptTooLongError: () => false,
  truncateHead20Percent: (s: string) => s,
  MAX_PTL_RETRIES: 3,
}))

import { sessionRoutes } from '../src/routes/session.js'
import { loadHistoryFull, saveHistory } from '../src/routes/chat-history.js'
import { appendRunEvent } from '../src/runs/run-timeline.js'

let dataDirs: string[] = []

function makeDataDir() {
  const dataDir = fs.mkdtempSync(path.join(tmpdir(), 'inkflow-session-'))
  dataDirs.push(dataDir)
  return dataDir
}

beforeEach(() => {
  generateWithPtlRetryMock.mockClear()
  generateWithPtlRetryMock.mockResolvedValue({ text: '[MOCK ROUTE SUMMARY]', retries: 0 })
})

afterEach(() => {
  for (const dataDir of dataDirs) {
    fs.rmSync(dataDir, { recursive: true, force: true })
  }
  dataDirs = []
})

describe('session routes', () => {
  it('clears chat session without deleting book assets', async () => {
    const dataDir = makeDataDir()
    const bookId = 'book-one'
    const bookDir = path.join(dataDir, bookId)
    fs.mkdirSync(path.join(bookDir, '04_Drafts'), { recursive: true })
    fs.writeFileSync(path.join(bookDir, '04_Drafts', 'ch01.md'), 'draft', 'utf8')
    saveHistory(dataDir, bookId, [{ role: 'user', content: 'hello' } as any])
    appendRunEvent(dataDir, bookId, {
      runId: 'run_1',
      seq: 1,
      ts: new Date().toISOString(),
      type: 'run_start',
      status: 'running',
      label: 'start',
    })
    fs.mkdirSync(path.join(bookDir, 'session_summaries'), { recursive: true })
    fs.writeFileSync(path.join(bookDir, 'session_summaries', 'sess_1.md'), 'summary', 'utf8')
    fs.writeFileSync(path.join(bookDir, 'compact_breaker.json'), '{"consecutiveFailures":1}', 'utf8')

    const app = Fastify()
    await app.register(sessionRoutes, { prefix: '/api/v1', dataDir })
    const response = await app.inject({ method: 'DELETE', url: `/api/v1/books/${bookId}/session` })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({ ok: true })
    expect(fs.existsSync(path.join(bookDir, 'author_chat_history.json'))).toBe(true)
    expect(JSON.parse(fs.readFileSync(path.join(bookDir, 'author_chat_history.json'), 'utf8'))).toEqual([])
    expect(fs.existsSync(path.join(bookDir, 'runs'))).toBe(false)
    expect(fs.existsSync(path.join(bookDir, 'session_summaries'))).toBe(false)
    expect(fs.existsSync(path.join(bookDir, 'compact_breaker.json'))).toBe(false)
    expect(fs.readFileSync(path.join(bookDir, '04_Drafts', 'ch01.md'), 'utf8')).toBe('draft')
  })

  it('returns compact unavailable when no history exists', async () => {
    const dataDir = makeDataDir()
    const bookId = 'book-one'
    fs.mkdirSync(path.join(dataDir, bookId), { recursive: true })

    const app = Fastify()
    await app.register(sessionRoutes, { prefix: '/api/v1', dataDir })
    const response = await app.inject({ method: 'POST', url: `/api/v1/books/${bookId}/session/compact` })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      ok: true,
      compactedCount: 0,
      message: 'No history to compact',
    })
  })

  it('compacts non-empty history with route dataDir settings and preserves the summary', async () => {
    const dataDir = makeDataDir()
    const bookId = 'book-one'
    const bookDir = path.join(dataDir, bookId)
    fs.mkdirSync(bookDir, { recursive: true })
    fs.writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify({
      providers: [{
        id: 'temp-provider',
        name: 'Temp Provider',
        baseUrl: 'https://temp.example/v1',
        apiKey: 'temp-key',
        models: ['temp-model'],
      }],
      authorModel: 'temp-provider/temp-model',
      editorModel: '',
    }), 'utf8')

    const largeContent = 'x'.repeat(25000)
    const history: ModelMessage[] = Array.from({ length: 8 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `${i}:${largeContent}`,
    }))
    saveHistory(dataDir, bookId, history)

    const app = Fastify()
    await app.register(sessionRoutes, { prefix: '/api/v1', dataDir })
    const response = await app.inject({ method: 'POST', url: `/api/v1/books/${bookId}/session/compact` })
    const body = JSON.parse(response.body)

    expect(response.statusCode).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.compactedCount).toBeGreaterThan(0)
    expect(body.action).toBe('force_compact_and_warn')
    expect(body.breakerTripped).toBe(false)

    const rawHistory = JSON.parse(fs.readFileSync(path.join(bookDir, 'author_chat_history.json'), 'utf8'))
    expect(rawHistory[0].role).toBe('system')
    expect(rawHistory[0].content).toContain('[MOCK ROUTE SUMMARY]')
    expect(rawHistory.length).toBeLessThan(history.length)

    const loadedHistory = loadHistoryFull(dataDir, bookId)
    expect(loadedHistory[0].role).toBe('system')
    expect(loadedHistory[0].content).toContain('[MOCK ROUTE SUMMARY]')

    const sessionSummaryDir = path.join(bookDir, 'session_summaries')
    expect(fs.existsSync(sessionSummaryDir)).toBe(true)
    expect(fs.readdirSync(sessionSummaryDir).filter(name => name.endsWith('.md')).length).toBe(1)
    expect(generateWithPtlRetryMock).toHaveBeenCalled()
    expect(generateWithPtlRetryMock.mock.calls[0][1]).toMatchObject({
      apiKey: 'temp-key',
      baseURL: 'https://temp.example/v1',
      model: 'temp-model',
    })
  })
})
