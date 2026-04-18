import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { workbenchRoutes } from '../src/routes/workbench.js'

let app: FastifyInstance
let tmpDir: string

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wbs-'))
  fs.mkdirSync(path.join(tmpDir, 'book1', '04_Drafts'), { recursive: true })
  app = Fastify()
  await app.register(workbenchRoutes, { prefix: '/api/v1', dataDir: tmpDir })
})

afterEach(async () => {
  await app.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('chapter status routes', () => {
  it('GET returns null decision when file missing', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/books/book1/chapters/ch01/status' })
    expect(r.statusCode).toBe(200)
    expect(r.json().user_decision).toBeNull()
    expect(r.json().chapter_id).toBe('ch01')
  })

  it('PUT approved sets user_decision and decided_at', async () => {
    const r = await app.inject({
      method: 'PUT',
      url: '/api/v1/books/book1/chapters/ch01/status',
      payload: { user_decision: 'approved', note: 'LGTM' },
    })
    expect(r.statusCode).toBe(200)
    const data = r.json()
    expect(data.user_decision).toBe('approved')
    expect(data.decided_at).toBeTruthy()
    expect(data.note).toBe('LGTM')
  })

  it('PUT null clears decision', async () => {
    await app.inject({
      method: 'PUT',
      url: '/api/v1/books/book1/chapters/ch01/status',
      payload: { user_decision: 'approved' },
    })
    const r = await app.inject({
      method: 'PUT',
      url: '/api/v1/books/book1/chapters/ch01/status',
      payload: { user_decision: null },
    })
    expect(r.json().user_decision).toBeNull()
  })

  it('file is written to 04_Drafts/chapter_status_ch01.json', async () => {
    await app.inject({
      method: 'PUT',
      url: '/api/v1/books/book1/chapters/ch01/status',
      payload: { user_decision: 'approved' },
    })
    const exists = fs.existsSync(path.join(tmpDir, 'book1', '04_Drafts', 'chapter_status_ch01.json'))
    expect(exists).toBe(true)
  })
})
