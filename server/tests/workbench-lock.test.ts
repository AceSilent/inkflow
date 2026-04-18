import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { workbenchRoutes } from '../src/routes/workbench.js'

let app: FastifyInstance
let tmpDir: string

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wbl-'))
  fs.mkdirSync(path.join(tmpDir, 'book1', '04_Drafts'), { recursive: true })
  app = Fastify()
  await app.register(workbenchRoutes, { prefix: '/api/v1', dataDir: tmpDir })
})

afterEach(async () => {
  await app.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('workbench lock', () => {
  it('POST creates a lock file with ISO timestamp content', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/books/book1/chapters/ch01/workbench-lock',
    })
    expect(r.statusCode).toBe(201)
    const file = path.join(tmpDir, 'book1', '04_Drafts', 'workbench_lock_ch01')
    expect(fs.existsSync(file)).toBe(true)
    const content = fs.readFileSync(file, 'utf8')
    expect(content).toMatch(/\d{4}-\d{2}-\d{2}T/)
  })

  it('DELETE removes the lock file', async () => {
    await app.inject({ method: 'POST', url: '/api/v1/books/book1/chapters/ch01/workbench-lock' })
    const r = await app.inject({
      method: 'DELETE',
      url: '/api/v1/books/book1/chapters/ch01/workbench-lock',
    })
    expect(r.statusCode).toBe(204)
    const file = path.join(tmpDir, 'book1', '04_Drafts', 'workbench_lock_ch01')
    expect(fs.existsSync(file)).toBe(false)
  })

  it('DELETE on missing lock is idempotent (still 204)', async () => {
    const r = await app.inject({
      method: 'DELETE',
      url: '/api/v1/books/book1/chapters/ch01/workbench-lock',
    })
    expect(r.statusCode).toBe(204)
  })
})
