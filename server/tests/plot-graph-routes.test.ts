import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { plotGraphRoutes } from '../src/routes/plot-graph.js'

let app: FastifyInstance
let tmpDir: string

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pgr-'))
  fs.mkdirSync(path.join(tmpDir, 'book1'), { recursive: true })
  app = Fastify()
  await app.register(plotGraphRoutes, { prefix: '/api/v1', dataDir: tmpDir })
})

afterEach(async () => {
  await app.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('plot-graph routes', () => {
  it('GET on empty graph returns empty', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/books/book1/plot-graph' })
    expect(r.statusCode).toBe(200)
    const g = r.json()
    expect(g.nodes).toEqual({})
    expect(g.edges).toEqual([])
  })

  it('POST node returns 201 with id', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/books/book1/plot-graph/nodes',
      payload: {
        type: 'setup', title: '怀表',
        description: '', references: ['ch01'],
        characters: [], status: 'draft',
      },
    })
    expect(r.statusCode).toBe(201)
    expect(r.json().id).toMatch(/^setup_/)
  })

  it('POST edge validates pays-off target', async () => {
    const a = await app.inject({
      method: 'POST',
      url: '/api/v1/books/book1/plot-graph/nodes',
      payload: { type: 'payoff', title: 'P', description: '', references: [], characters: [], status: 'draft' },
    })
    const b = await app.inject({
      method: 'POST',
      url: '/api/v1/books/book1/plot-graph/nodes',
      payload: { type: 'event', title: 'E', description: '', references: [], characters: [], status: 'draft' },
    })
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/books/book1/plot-graph/edges',
      payload: { from: a.json().id, to: b.json().id, type: 'pays-off' },
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/setup/i)
  })

  it('GET unresolved-setups lists only setup nodes without pays-off', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/books/book1/plot-graph/nodes',
      payload: { type: 'setup', title: 's1', description: '', references: ['ch01'], characters: [], status: 'draft' },
    })
    const r = await app.inject({ method: 'GET', url: '/api/v1/books/book1/plot-graph/unresolved-setups' })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toHaveLength(1)
    expect(r.json()[0].title).toBe('s1')
  })
})
