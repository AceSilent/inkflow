import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import Fastify from 'fastify'
import { checkpointRoutes } from '../src/routes/checkpoints.js'
import { createSnapshot, listSnapshots } from '../src/snapshots/snapshots.js'
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
  async function restoreCheckpoint(
    bookId: string,
    checkpointId: string,
    payload: { message_id?: string; replacement_message?: string },
  ) {
    const app = Fastify()
    await app.register(checkpointRoutes, { prefix: '/api/v1', dataDir: tmpDir })
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/books/${bookId}/checkpoints/${checkpointId}/restore`,
      payload,
    })
    await app.close()
    return response
  }

  function makeDraft(bookId: string, content = 'before'): string {
    const draftPath = path.join(tmpDir, bookId, '04_Drafts', 'ch01.md')
    fs.mkdirSync(path.dirname(draftPath), { recursive: true })
    fs.writeFileSync(draftPath, content, 'utf8')
    return draftPath
  }

  it('restores a checkpoint, truncates history to the edited message, and clears recent runs', async () => {
    const bookId = 'book-1'
    const draftPath = makeDraft(bookId)

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

    const response = await restoreCheckpoint(
      bookId,
      checkpoint.id,
      { message_id: 'm1', replacement_message: 'first edited' },
    )

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({ ok: true, messages: 1 })
    expect(fs.readFileSync(draftPath, 'utf8')).toBe('before')
    expect(loadHistoryFull(tmpDir, bookId)).toEqual([
      { role: 'user', content: 'first edited', id: 'm1', checkpoint_id: checkpoint.id },
    ])
    expect(loadRecentRuns(tmpDir, bookId)).toEqual([])
  })

  it('rejects missing message ids without mutating draft, runs, or snapshots', async () => {
    const bookId = 'book-1'
    const draftPath = makeDraft(bookId)
    const checkpoint = createSnapshot(tmpDir, bookId, 'first message', { messageId: 'm1' })

    await new Promise(resolve => setTimeout(resolve, 2))
    fs.writeFileSync(draftPath, 'after', 'utf8')
    const newer = createSnapshot(tmpDir, bookId, 'later message', { messageId: 'm2' })
    saveHistory(tmpDir, bookId, [
      { role: 'user', content: 'first message', id: 'm1', checkpoint_id: checkpoint.id } as any,
      { role: 'assistant', content: 'assistant reply' },
    ])
    appendRunEvent(tmpDir, bookId, {
      runId: 'run_20260425T120000_restore',
      seq: 1,
      ts: '2026-04-25T12:00:00.000Z',
      type: 'run_start',
      status: 'running',
      label: 'start',
    })

    const response = await restoreCheckpoint(bookId, checkpoint.id, {
      message_id: 'missing',
      replacement_message: 'edited',
    })

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body).error).toContain('message')
    expect(fs.readFileSync(draftPath, 'utf8')).toBe('after')
    expect(loadHistoryFull(tmpDir, bookId).map(message => message.id)).toEqual(['m1', undefined])
    expect(loadRecentRuns(tmpDir, bookId)).toHaveLength(1)
    expect(listSnapshots(tmpDir, bookId).map(s => s.id)).toContain(newer.id)
  })

  it('rejects checkpoint/message mismatches before restoring files', async () => {
    const bookId = 'book-1'
    const draftPath = makeDraft(bookId)
    const checkpoint = createSnapshot(tmpDir, bookId, 'first message', { messageId: 'm1' })
    fs.writeFileSync(draftPath, 'after', 'utf8')
    saveHistory(tmpDir, bookId, [
      { role: 'user', content: 'first message', id: 'm1', checkpoint_id: 'other-checkpoint' } as any,
    ])

    const response = await restoreCheckpoint(bookId, checkpoint.id, {
      message_id: 'm1',
      replacement_message: 'edited',
    })

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body).error).toContain('checkpoint')
    expect(fs.readFileSync(draftPath, 'utf8')).toBe('after')
    expect(loadHistoryFull(tmpDir, bookId)[0]).toMatchObject({ content: 'first message', checkpoint_id: 'other-checkpoint' })
  })

  it('rejects snapshots whose metadata belongs to a different message', async () => {
    const bookId = 'book-1'
    const draftPath = makeDraft(bookId)
    const checkpoint = createSnapshot(tmpDir, bookId, 'first message', { messageId: 'different-message' })
    fs.writeFileSync(draftPath, 'after', 'utf8')
    saveHistory(tmpDir, bookId, [
      { role: 'user', content: 'first message', id: 'm1', checkpoint_id: checkpoint.id } as any,
    ])

    const response = await restoreCheckpoint(bookId, checkpoint.id, {
      message_id: 'm1',
      replacement_message: 'edited',
    })

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body).error).toContain('checkpoint')
    expect(fs.readFileSync(draftPath, 'utf8')).toBe('after')
    expect(loadHistoryFull(tmpDir, bookId)[0].content).toBe('first message')
  })

  it('rejects non-user message targets without restoring files', async () => {
    const bookId = 'book-1'
    const draftPath = makeDraft(bookId)
    const checkpoint = createSnapshot(tmpDir, bookId, 'assistant reply', { messageId: 'a1' })
    fs.writeFileSync(draftPath, 'after', 'utf8')
    saveHistory(tmpDir, bookId, [
      { role: 'assistant', content: 'assistant reply', id: 'a1', checkpoint_id: checkpoint.id } as any,
    ])

    const response = await restoreCheckpoint(bookId, checkpoint.id, { message_id: 'a1' })

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body).error).toContain('user message')
    expect(fs.readFileSync(draftPath, 'utf8')).toBe('after')
    expect(loadHistoryFull(tmpDir, bookId)).toEqual([
      { role: 'assistant', content: 'assistant reply', id: 'a1', checkpoint_id: checkpoint.id },
    ])
  })

  it('restores after compacted history while preserving the compacted system summary', async () => {
    const bookId = 'book-1'
    const draftPath = makeDraft(bookId)
    const checkpoint = createSnapshot(tmpDir, bookId, 'after compact', { messageId: 'm1' })
    fs.writeFileSync(draftPath, 'after', 'utf8')
    saveHistory(tmpDir, bookId, [
      { role: 'system', content: 'compacted summary' },
      { role: 'user', content: 'after compact', id: 'm1', checkpoint_id: checkpoint.id } as any,
      { role: 'assistant', content: 'assistant reply' },
      { role: 'user', content: 'later message', id: 'm2' } as any,
    ])

    const response = await restoreCheckpoint(bookId, checkpoint.id, {
      message_id: 'm1',
      replacement_message: 'after compact edited',
    })

    expect(response.statusCode).toBe(200)
    expect(fs.readFileSync(draftPath, 'utf8')).toBe('before')
    expect(loadHistoryFull(tmpDir, bookId)).toEqual([
      { role: 'system', content: 'compacted summary' },
      { role: 'user', content: 'after compact edited', id: 'm1', checkpoint_id: checkpoint.id },
    ])
  })
})
