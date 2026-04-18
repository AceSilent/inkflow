import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { workbenchRoutes } from '../src/routes/workbench.js'

let app: FastifyInstance
let tmpDir: string

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-'))
  fs.mkdirSync(path.join(tmpDir, 'book1', '04_Drafts'), { recursive: true })
  app = Fastify()
  await app.register(workbenchRoutes, { prefix: '/api/v1', dataDir: tmpDir })
})

afterEach(async () => {
  await app.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('annotation routes', () => {
  it('GET returns empty array when file missing', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/books/book1/chapters/ch01/annotations' })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toEqual([])
  })

  it('POST creates annotation with generated id and created_at', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/books/book1/chapters/ch01/annotations',
      payload: { quote: 'x', anchor_start: 0, anchor_end: 1, comment: 'y', source: 'user' },
    })
    expect(r.statusCode).toBe(201)
    const ann = r.json()
    expect(ann.id).toMatch(/^ann_/)
    expect(ann.status).toBe('open')
    expect(ann.created_at).toBeTruthy()
  })

  it('POST then GET returns the created annotation', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/books/book1/chapters/ch01/annotations',
      payload: { quote: 'x', anchor_start: 0, anchor_end: 1, comment: 'y', source: 'user' },
    })
    const created = create.json()
    const list = await app.inject({ method: 'GET', url: '/api/v1/books/book1/chapters/ch01/annotations' })
    expect(list.json()).toHaveLength(1)
    expect(list.json()[0].id).toBe(created.id)
  })

  it('PATCH updates comment', async () => {
    const c = await app.inject({
      method: 'POST',
      url: '/api/v1/books/book1/chapters/ch01/annotations',
      payload: { quote: 'x', anchor_start: 0, anchor_end: 1, comment: 'old', source: 'user' },
    })
    const id = c.json().id
    const u = await app.inject({
      method: 'PATCH',
      url: `/api/v1/books/book1/chapters/ch01/annotations/${id}`,
      payload: { comment: 'new' },
    })
    expect(u.statusCode).toBe(200)
    expect(u.json().comment).toBe('new')
  })

  it('DELETE removes annotation', async () => {
    const c = await app.inject({
      method: 'POST',
      url: '/api/v1/books/book1/chapters/ch01/annotations',
      payload: { quote: 'x', anchor_start: 0, anchor_end: 1, comment: 'y', source: 'user' },
    })
    const id = c.json().id
    await app.inject({ method: 'DELETE', url: `/api/v1/books/book1/chapters/ch01/annotations/${id}` })
    const list = await app.inject({ method: 'GET', url: '/api/v1/books/book1/chapters/ch01/annotations' })
    expect(list.json()).toHaveLength(0)
  })

  it('rejects bookId with path traversal', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/api/v1/books/..%2Fevil/chapters/ch01/annotations',
    })
    expect(r.statusCode).toBeGreaterThanOrEqual(400)
  })
})
