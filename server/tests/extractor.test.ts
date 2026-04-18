import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { ingestExtracted, type ExtractedMemory } from '../src/memory/extractor.js'

let parentDir: string
let tmpDir: string

beforeEach(() => {
  parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-'))
  tmpDir = path.join(parentDir, 'books')
  fs.mkdirSync(path.join(tmpDir, 'book1'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(parentDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('extractor', () => {
  it('ingestExtracted writes _pending memory files', async () => {
    const extracted: ExtractedMemory[] = [
      { scope: 'user', type: 'preference', title: 'no AI tone', body: 'user dislikes AI-style metaphors', confidence: 0.9, tags: ['prose-style'] },
    ]
    const result = await ingestExtracted(tmpDir, extracted)
    expect(result.written).toHaveLength(1)
    const pendingDir = path.join(parentDir, 'global', 'memories', '_pending')
    expect(fs.readdirSync(pendingDir).filter(f => f.endsWith('.md'))).toHaveLength(1)
  })

  it('ingestExtracted skips duplicates (body similarity > 80%)', async () => {
    const e1: ExtractedMemory = { scope: 'user', type: 'preference', title: 't', body: '主角不能哭', confidence: 0.9, tags: [] }
    await ingestExtracted(tmpDir, [e1])
    const e2: ExtractedMemory = { scope: 'user', type: 'preference', title: 't2', body: '主角不能哭（用户明确）', confidence: 0.85, tags: [] }
    const result = await ingestExtracted(tmpDir, [e2])
    expect(result.skipped).toHaveLength(1)
    expect(result.written).toHaveLength(0)
  })

  it('ingestExtracted filters confidence < 0.3', async () => {
    const low: ExtractedMemory = { scope: 'user', type: 'preference', title: 'low', body: 'maybe', confidence: 0.2, tags: [] }
    const result = await ingestExtracted(tmpDir, [low])
    expect(result.skipped).toHaveLength(1)
    expect(result.written).toHaveLength(0)
  })
})
