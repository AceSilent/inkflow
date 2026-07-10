/**
 * Codex OAuth Responses API requires streaming requests. Editorial reviewers
 * are batch-style calls, but when their model is Codex-backed they still need
 * to use streamText() and collect the final text.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const aiMocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
}))

vi.mock('ai', () => ({
  generateText: aiMocks.generateText,
  streamText: aiMocks.streamText,
}))

import { runEditorialPipeline } from '../src/editorial/pipeline.js'

let tmpDir: string
let promptsDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'editorial-codex-'))
  promptsDir = path.join(tmpDir, 'prompts')
  fs.mkdirSync(promptsDir, { recursive: true })
  fs.writeFileSync(
    path.join(promptsDir, 'reader_scene_lore.j2'),
    'Review this draft and return JSON only: {{ draft }}',
    'utf8',
  )
  aiMocks.generateText.mockReset()
  aiMocks.streamText.mockReset()
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('editorial Codex reviewer transport', () => {
  it('uses streamText for codex-oauth reviewers and parses the collected text', async () => {
    aiMocks.streamText.mockReturnValue({
      text: Promise.resolve(JSON.stringify({
        pass_status: true,
        issues: [],
        quick_comment: 'ok',
      })),
    })

    const result = await runEditorialPipeline(
      '正文内容',
      { reviewers: ['editorial_lore'] },
      { apiKey: '', model: 'gpt-5.5', kind: 'codex-oauth', dataDir: tmpDir },
      promptsDir,
    )

    expect(aiMocks.streamText).toHaveBeenCalledTimes(1)
    expect(aiMocks.generateText).not.toHaveBeenCalled()
    expect(aiMocks.streamText).toHaveBeenCalledWith(expect.objectContaining({
      temperature: 0.3,
      maxRetries: 0,
      providerOptions: expect.objectContaining({
        openai: expect.objectContaining({ store: false }),
      }),
    }))
    expect(result.feedbacks[0]).toEqual(expect.objectContaining({
      reviewer: 'editorial_lore',
      pass_status: true,
      quick_comment: 'ok',
    }))
  })
})
