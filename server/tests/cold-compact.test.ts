import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import type { ModelMessage } from 'ai'

// Mock PTL BEFORE importing cold-compact so the mock wins.
vi.mock('../src/context/ptl-fallback.js', () => ({
  generateWithPtlRetry: vi.fn().mockResolvedValue({ text: '[MOCK SUMMARY]', retries: 0 }),
  isPromptTooLongError: () => false,
  truncateHead20Percent: (s: string) => s,
  MAX_PTL_RETRIES: 3,
}))

import { compactColdSegment } from '../src/context/cold-compact.js'
import { createSessionState } from '../src/context/session-state.js'

let parentDir: string
let tmpDir: string

beforeEach(() => {
  parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-'))
  tmpDir = path.join(parentDir, 'books')
  fs.mkdirSync(path.join(tmpDir, 'book1'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(parentDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('compactColdSegment', () => {
  it('produces summary + session summary file', async () => {
    const cold: ModelMessage[] = [
      { role: 'user', content: 'earliest question' },
      { role: 'assistant', content: 'earliest answer' },
      { role: 'user', content: 'follow-up' },
    ]
    const warm: ModelMessage[] = [{ role: 'user', content: 'recent' }]
    const hot: ModelMessage[] = [{ role: 'assistant', content: 'latest' }]
    const result = await compactColdSegment({
      cold, warm, hot,
      sessionState: createSessionState(),
      llmConfig: { apiKey: 'test', model: 'test-model' },
      bookDir: path.join(tmpDir, 'book1'),
    })
    expect(result.summaryText).toContain('[MOCK SUMMARY]')
    expect(result.newMessages.length).toBe(1 + warm.length + hot.length)
    expect(result.stats.compacted).toBe(cold.length)

    const sessDir = path.join(tmpDir, 'book1', 'session_summaries')
    expect(fs.existsSync(sessDir)).toBe(true)
    const files = fs.readdirSync(sessDir).filter(f => f.endsWith('.md'))
    expect(files.length).toBe(1)
  })

  it('returns messages unchanged when cold is empty', async () => {
    const warm: ModelMessage[] = [{ role: 'user', content: 'x' }]
    const hot: ModelMessage[] = [{ role: 'assistant', content: 'y' }]
    const result = await compactColdSegment({
      cold: [], warm, hot,
      sessionState: createSessionState(),
      llmConfig: { apiKey: 'test', model: 'test-model' },
      bookDir: path.join(tmpDir, 'book1'),
    })
    expect(result.stats.compacted).toBe(0)
    expect(result.newMessages).toEqual([...warm, ...hot])
  })
})
