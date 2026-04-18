import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { memoryRoutes } from '../src/routes/memory.js'
import { writeMemory } from '../src/memory/memory-service.js'

let app: FastifyInstance
let tmpDir: string
let parentDir: string

beforeEach(async () => {
  parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memr-'))
  tmpDir = path.join(parentDir, 'books')
  fs.mkdirSync(path.join(tmpDir, 'book1'), { recursive: true })
  app = Fastify()
  await app.register(memoryRoutes, { prefix: '/api/v1', dataDir: tmpDir })
})

afterEach(async () => {
  await app.close()
  fs.rmSync(parentDir, { recursive: true, force: true })
})

describe('memory routes', () => {
  it('GET /memory/pending returns empty initially', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/memory/pending' })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toEqual([])
  })

  it('POST /memory/remember writes directly to active', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/memory/remember',
      payload: { text: '主角左手有一道疤' },
    })
    expect(r.statusCode).toBe(201)
    const ann = r.json()
    expect(ann.frontmatter.status).toBe('active')
    expect(ann.frontmatter.scope).toBe('user')
  })

  it('POST /memory/:id/approve moves pending → active', async () => {
    writeMemory(tmpDir, {
      id: 'mem_abc', scope: 'user', type: 'preference',
      confidence: 0.8, tags: [], source: 'auto_extract',
      status: 'pending', created_at: '2026-04-18T00:00:00Z',
    }, 'body')
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/memory/mem_abc/approve',
    })
    expect(r.statusCode).toBe(200)
    const pending = await app.inject({ method: 'GET', url: '/api/v1/memory/pending' })
    expect(pending.json()).toHaveLength(0)
  })

  it('DELETE /memory/:id removes file', async () => {
    writeMemory(tmpDir, {
      id: 'mem_x', scope: 'user', type: 'preference',
      confidence: 0.8, tags: [], source: 'auto_extract',
      status: 'active', created_at: '2026-04-18T00:00:00Z',
    }, 'body')
    const r = await app.inject({ method: 'DELETE', url: '/api/v1/memory/mem_x' })
    expect(r.statusCode).toBe(204)
    const active = await app.inject({ method: 'GET', url: '/api/v1/memory/active' })
    expect(active.json()).toHaveLength(0)
  })
})
