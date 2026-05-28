import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import Fastify from 'fastify'
import { checkpointRoutes } from '../src/routes/checkpoints.js'
import { createSnapshot } from '../src/snapshots/snapshots.js'
import { loadHistoryFull, saveHistory } from '../src/routes/chat-history.js'
import { appendRunEvent, loadRecentRuns } from '../src/runs/run-timeline.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'checkpoint-routes-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('checkpoint routes', () => {
  it('restores a checkpoint, truncates history to the edited message, and clears recent runs', async () => {
    const bookId = 'book-1'
    const draftPath = path.join(tmpDir, bookId, '04_Drafts', 'ch01.md')
    fs.mkdirSync(path.dirname(draftPath), { recursive: true })
    fs.writeFileSync(draftPath, 'before', 'utf8')

    const checkpoint = createSnapshot(tmpDir, bookId, 'first message', { messageId: 'm1' })

    fs.writeFileSync(draftPath, 'after', 'utf8')
    saveHistory(tmpDir, bookId, [
      { role: 'user', content: 'first message', id: 'm1', checkpoint_id: checkpoint.id } as any,
      { role: 'assistant', content: 'assistant reply' },
      { role: 'user', content: 'later message', id: 'm2' } as any,
    ])
    appendRunEvent(tmpDir, bookId, {
      runId: 'run_20260425T120000_restore',
      seq: 1,
      ts: '2026-04-25T12:00:00.000Z',
      type: 'run_start',
      status: 'running',
      label: 'start',
    })

    const app = Fastify()
    await app.register(checkpointRoutes, { prefix: '/api/v1', dataDir: tmpDir })

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/books/${bookId}/checkpoints/${checkpoint.id}/restore`,
      payload: { message_id: 'm1', replacement_message: 'first edited' },
    })
    await app.close()

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({ ok: true, messages: 1 })
    expect(fs.readFileSync(draftPath, 'utf8')).toBe('before')
    expect(loadHistoryFull(tmpDir, bookId)).toEqual([
      { role: 'user', content: 'first edited', id: 'm1', checkpoint_id: checkpoint.id },
    ])
    expect(loadRecentRuns(tmpDir, bookId)).toEqual([])
  })
})
