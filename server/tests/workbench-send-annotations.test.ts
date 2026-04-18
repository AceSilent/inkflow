import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { workbenchRoutes } from '../src/routes/workbench.js'

let app: FastifyInstance
let tmpDir: string

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wbsa-'))
  const drafts = path.join(tmpDir, 'book1', '04_Drafts')
  fs.mkdirSync(drafts, { recursive: true })
  fs.writeFileSync(path.join(drafts, 'ch01.md'), 'DraftText', 'utf8')
  fs.writeFileSync(path.join(drafts, 'annotations_ch01.json'), JSON.stringify([
    { id: 'ann_1', quote: 'x', anchor_start: 0, anchor_end: 1, comment: 'fix turn',
      source: 'user', status: 'open', created_at: '2026-04-18T00:00:00Z' },
    { id: 'ann_2', quote: 'y', anchor_start: 2, anchor_end: 3, comment: 'clarify',
      source: 'user', status: 'open', created_at: '2026-04-18T00:00:00Z' },
  ]))
  app = Fastify()
  await app.register(workbenchRoutes, { prefix: '/api/v1', dataDir: tmpDir })
})

afterEach(async () => {
  await app.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('send-annotations', () => {
  it('returns 400 if annotation_ids not found', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/books/book1/chapters/ch01/send-annotations',
      payload: { annotation_ids: ['ann_nonexistent'] },
    })
    expect(r.statusCode).toBe(400)
  })

  it('marks annotations as sent with sent_batch_id', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/books/book1/chapters/ch01/send-annotations',
      payload: { annotation_ids: ['ann_1', 'ann_2'] },
    })
    expect(r.statusCode).toBe(200)
    const data = r.json()
    expect(data.batch_id).toMatch(/^batch_/)
    expect(data.prompt).toContain('fix turn')
    expect(data.prompt).toContain('clarify')
    expect(data.count).toBe(2)

    const updated = JSON.parse(fs.readFileSync(
      path.join(tmpDir, 'book1', '04_Drafts', 'annotations_ch01.json'), 'utf8'))
    expect(updated[0].status).toBe('sent')
    expect(updated[0].sent_batch_id).toBe(data.batch_id)
    expect(updated[0].sent_at).toBeTruthy()
    expect(updated[1].status).toBe('sent')
    expect(updated[1].sent_batch_id).toBe(data.batch_id)
    expect(updated[1].sent_at).toBeTruthy()
  })
})
