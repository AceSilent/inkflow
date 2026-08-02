import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { dataRoutes } from '../src/routes/data.js'

describe('Lore routes', () => {
  let app: FastifyInstance
  let dataDir: string
  let previousDataDir: string | undefined

  beforeEach(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkflow-lore-route-'))
    fs.mkdirSync(path.join(dataDir, 'book-1'), { recursive: true })
    previousDataDir = process.env.AUTONOVEL_DATA_DIR
    process.env.AUTONOVEL_DATA_DIR = dataDir
    app = Fastify()
    await app.register(dataRoutes)
  })

  afterEach(async () => {
    await app.close()
    fs.rmSync(dataDir, { recursive: true, force: true })
    if (previousDataDir === undefined) delete process.env.AUTONOVEL_DATA_DIR
    else process.env.AUTONOVEL_DATA_DIR = previousDataDir
  })

  it('lets a user save canonical lore and rejects a stale revision', async () => {
    const document = {
      schema_version: 1,
      category: 'world_setting',
      revision: 0,
      entries: [{
        id: 'old-city',
        title: '旧城',
        entry_type: '世界与地点',
        status: 'confirmed',
        tags: ['地点'],
        aliases: [],
        content: '终年落雪。',
        updated_at: new Date().toISOString(),
      }],
    }

    const saved = await app.inject({
      method: 'PUT',
      url: '/api/v1/books/book-1/lore/world_setting',
      payload: document,
    })
    expect(saved.statusCode).toBe(200)
    expect(saved.json().revision).toBe(1)

    const loaded = await app.inject({
      method: 'GET',
      url: '/api/v1/books/book-1/lore',
    })
    expect(loaded.statusCode).toBe(200)
    expect(loaded.json().world_setting.entries[0].content).toBe('终年落雪。')

    const stale = await app.inject({
      method: 'PUT',
      url: '/api/v1/books/book-1/lore/world_setting',
      payload: document,
    })
    expect(stale.statusCode).toBe(409)
    expect(stale.json()).toMatchObject({
      error: 'lore_revision_conflict',
      expected_revision: 0,
      actual_revision: 1,
    })
  })

  it('rejects a document whose category does not match the route', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/v1/books/book-1/lore/characters',
      payload: {
        schema_version: 1,
        category: 'world_setting',
        revision: 0,
        entries: [],
      },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error).toContain('does not match')
  })
})
