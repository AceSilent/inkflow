import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { blockWhileUserEditing } from '../src/stats/tips/block-while-user-editing.js'

let tmpDir: string
let bookDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bwe-'))
  bookDir = path.join(tmpDir, 'book1')
  fs.mkdirSync(path.join(bookDir, '04_Drafts'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('blockWhileUserEditing', () => {
  it('allows save_draft when no lock file', async () => {
    const hook = blockWhileUserEditing(bookDir)
    const result = await hook.interceptToolCall!({
      toolName: 'save_draft',
      args: { file_path: 'ch01.md', content: 'x'.repeat(900) },
    })
    expect(result).toBeNull()
  })

  it('blocks save_draft when lock file exists and recent', async () => {
    fs.writeFileSync(
      path.join(bookDir, '04_Drafts', 'workbench_lock_ch01'),
      new Date().toISOString()
    )
    const hook = blockWhileUserEditing(bookDir)
    const result = await hook.interceptToolCall!({
      toolName: 'save_draft',
      args: { file_path: 'ch01.md', content: 'x'.repeat(900) },
    })
    expect(result).toContain('User is currently editing')
  })

  it('treats stale lock (>10min) as expired and allows save', async () => {
    const oldTs = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const lockFile = path.join(bookDir, '04_Drafts', 'workbench_lock_ch01')
    fs.writeFileSync(lockFile, oldTs)
    const hook = blockWhileUserEditing(bookDir)
    const result = await hook.interceptToolCall!({
      toolName: 'save_draft',
      args: { file_path: 'ch01.md', content: 'x'.repeat(900) },
    })
    expect(result).toBeNull()
    // Stale lock file should be cleaned up.
    expect(fs.existsSync(lockFile)).toBe(false)
  })

  it('ignores tools other than save_draft', async () => {
    fs.writeFileSync(path.join(bookDir, '04_Drafts', 'workbench_lock_ch01'), new Date().toISOString())
    const hook = blockWhileUserEditing(bookDir)
    const result = await hook.interceptToolCall!({
      toolName: 'save_outline',
      args: {},
    })
    expect(result).toBeNull()
  })
})
