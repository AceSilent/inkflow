import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { tmpdir } from 'os'
import Fastify from 'fastify'
import { sessionRoutes } from '../src/routes/session.js'
import { saveHistory } from '../src/routes/chat-history.js'
import { appendRunEvent } from '../src/runs/run-timeline.js'

function makeDataDir() {
  return fs.mkdtempSync(path.join(tmpdir(), 'inkflow-session-'))
}

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

    const app = Fastify()
    await app.register(sessionRoutes, { prefix: '/api/v1', dataDir })
    const response = await app.inject({ method: 'DELETE', url: `/api/v1/books/${bookId}/session` })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({ ok: true })
    expect(fs.existsSync(path.join(bookDir, 'author_chat_history.json'))).toBe(true)
    expect(JSON.parse(fs.readFileSync(path.join(bookDir, 'author_chat_history.json'), 'utf8'))).toEqual([])
    expect(fs.existsSync(path.join(bookDir, 'runs'))).toBe(false)
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
})
