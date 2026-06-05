import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import Fastify from 'fastify'
import { writeMemory } from '../src/memory/memory-service.js'

const aiMocks = vi.hoisted(() => ({
  streamText: vi.fn(),
  generateText: vi.fn(),
}))

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai')
  return {
    ...actual,
    streamText: aiMocks.streamText,
    generateText: aiMocks.generateText,
    stepCountIs: vi.fn((steps: number) => ({ type: 'step-count', steps })),
  }
})

import { authorChatRoutes } from '../src/routes/author-chat.js'

function oneChunkStream(text: string) {
  return {
    async *[Symbol.asyncIterator]() {
      yield { type: 'text-delta', text }
    },
  }
}

describe('Author Chat memory injection', () => {
  let parentDir: string
  let dataDir: string
  let previousDataDir: string | undefined

  beforeEach(() => {
    parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'author-route-memory-'))
    dataDir = path.join(parentDir, 'books')
    fs.mkdirSync(path.join(dataDir, 'book1'), { recursive: true })
    previousDataDir = process.env.AUTONOVEL_DATA_DIR
    process.env.AUTONOVEL_DATA_DIR = dataDir

    aiMocks.streamText.mockReset()
    aiMocks.generateText.mockReset()
    aiMocks.streamText.mockReturnValue({
      fullStream: oneChunkStream('收到。'),
      text: Promise.resolve('收到。'),
      usage: Promise.resolve({ totalTokens: 0 }),
    })
    aiMocks.generateText.mockResolvedValue({ text: '[]' })
  })

  afterEach(() => {
    if (previousDataDir === undefined) delete process.env.AUTONOVEL_DATA_DIR
    else process.env.AUTONOVEL_DATA_DIR = previousDataDir
    fs.rmSync(parentDir, { recursive: true, force: true })
  })

  it('passes active book memory into the bound author-agent system prompt', async () => {
    writeMemory(dataDir, {
      id: 'm-route',
      scope: 'book',
      book_id: 'book1',
      type: 'preference',
      confidence: 0.95,
      tags: [],
      source: 'user_remember',
      status: 'active',
      created_at: '2026-06-06T00:00:00Z',
    }, '本书现场描写要克制，少用比喻。')

    const app = Fastify()
    await app.register(authorChatRoutes)
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/author-chat/book1/send',
      payload: { message: '继续讨论这一章。' },
    })
    await app.close()

    expect(response.statusCode).toBe(200)
    expect(aiMocks.streamText).toHaveBeenCalledTimes(1)
    const call = aiMocks.streamText.mock.calls[0][0] as { system?: string }
    expect(call.system).toContain('# 记忆')
    expect(call.system).toContain('本书现场描写要克制，少用比喻')
  })
})
