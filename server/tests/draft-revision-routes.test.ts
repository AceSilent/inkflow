import Fastify, { type FastifyInstance } from 'fastify'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { contentHash } from '../src/tools/draft-history.js'
import { dataRoutes } from '../src/routes/data.js'

describe('draft revision routes', () => {
  let app: FastifyInstance
  let dataDir: string
  let previousDataDir: string | undefined

  beforeEach(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'draft-revision-routes-'))
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

  it('attributes manual saves, exposes diffs, blocks stale saves, and restores', async () => {
    const firstSave = await app.inject({
      method: 'PUT',
      url: '/api/v1/books/book1/chapters/ch01/draft',
      payload: { content: '第一行\n旧句', expected_hash: contentHash('') },
    })
    expect(firstSave.statusCode).toBe(200)
    const first = firstSave.json()
    expect(first.revision).toMatchObject({ actor: 'user', source: 'workbench' })

    const secondSave = await app.inject({
      method: 'PUT',
      url: '/api/v1/books/book1/chapters/ch01/draft',
      payload: { content: '第一行\n新句', expected_hash: first.content_hash },
    })
    expect(secondSave.statusCode).toBe(200)
    const second = secondSave.json()

    const history = await app.inject({
      method: 'GET',
      url: '/api/v1/books/book1/chapters/ch01/history',
    })
    expect(history.statusCode).toBe(200)
    expect(history.json().revisions).toHaveLength(2)
    expect(history.json().revisions[0]).toMatchObject({
      id: second.revision.id,
      actor: 'user',
      is_current: true,
    })

    const diff = await app.inject({
      method: 'GET',
      url: `/api/v1/books/book1/chapters/ch01/diff?from=${first.revision.id}&to=${second.revision.id}`,
    })
    expect(diff.statusCode).toBe(200)
    expect(diff.json()).toMatchObject({ additions: 1, deletions: 1 })

    const staleSave = await app.inject({
      method: 'PUT',
      url: '/api/v1/books/book1/chapters/ch01/draft',
      payload: { content: '不应覆盖', expected_hash: first.content_hash },
    })
    expect(staleSave.statusCode).toBe(409)
    expect(staleSave.json().code).toBe('DRAFT_REVISION_CONFLICT')

    const restore = await app.inject({
      method: 'POST',
      url: '/api/v1/books/book1/chapters/ch01/restore',
      payload: { revision_id: first.revision.id, expected_hash: second.content_hash },
    })
    expect(restore.statusCode).toBe(200)
    expect(restore.json().revision).toMatchObject({
      actor: 'user',
      source: 'restore',
      restored_from: first.revision.id,
    })
    expect(
      fs.readFileSync(path.join(dataDir, 'book1', '04_Drafts', 'ch01.md'), 'utf8')
    ).toBe('第一行\n旧句')
  })
})
