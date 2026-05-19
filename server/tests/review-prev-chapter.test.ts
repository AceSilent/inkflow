import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { reviewPrevChapter } from '../src/stats/tips/review-prev-chapter.js'
import { type RuleContext } from '../src/stats/tips/types.js'

let tmpDir: string
let ctx: RuleContext

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpc-'))
  fs.mkdirSync(path.join(tmpDir, 'book1', '04_Drafts'), { recursive: true })
  ctx = {
    dataDir: tmpDir,
    bookId: 'book1',
    callsThisStream: new Map(),
    lastArgs: new Map(),
    emitted: new Set(),
    emit: () => {},
  }
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function writeStatus(chId: string, user_decision: 'approved' | 'rejected' | null) {
  const file = path.join(tmpDir, 'book1', '04_Drafts', `chapter_status_${chId}.json`)
  fs.writeFileSync(
    file,
    JSON.stringify({ chapter_id: chId, user_decision, decided_at: '2026-04-18T00:00:00Z' }),
    'utf-8',
  )
}

function writeReview(chId: string, overall_pass: boolean) {
  const file = path.join(tmpDir, 'book1', '04_Drafts', `review_${chId}.json`)
  fs.writeFileSync(file, JSON.stringify({ overall_pass }), 'utf-8')
}

describe('reviewPrevChapter — user_decision override', () => {
  it('prev chapter approved by user (no review file) → hook returns null/allows', () => {
    writeStatus('ch01', 'approved')
    const hooks = reviewPrevChapter(ctx)
    const result = hooks.interceptToolCall!('save_script', { file_path: 'ch02.md' })
    expect(result).toBeFalsy()
  })

  it('prev chapter rejected by user (passing review exists) → hook returns BLOCKED (user_decision wins)', () => {
    writeStatus('ch01', 'rejected')
    writeReview('ch01', true)
    const hooks = reviewPrevChapter(ctx)
    const result = hooks.interceptToolCall!('save_script', { file_path: 'ch02.md' })
    expect(result).toBeTruthy()
    expect((result as any).block).toBe(true)
    expect((result as any).message).toContain('[BLOCKED]')
    expect((result as any).message).toContain('ch01')
    expect((result as any).message).toMatch(/拒绝|rejected/)
  })

  it('prev chapter user_decision=null but passing review → hook still blocks for human final approval', () => {
    writeStatus('ch01', null)
    writeReview('ch01', true)
    const hooks = reviewPrevChapter(ctx)
    const result = hooks.interceptToolCall!('save_script', { file_path: 'ch02.md' })
    expect(result).toBeTruthy()
    expect((result as any).block).toBe(true)
    expect((result as any).message).toContain('人类')
  })
})
