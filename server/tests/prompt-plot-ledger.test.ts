import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { buildPlotGraphStatus } from '../src/agent/prompt-builder.js'
import { addNode } from '../src/services/plot-graph.js'

let tmpDir: string
let bookDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plgp-'))
  bookDir = path.join(tmpDir, 'book1')
  fs.mkdirSync(bookDir, { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('buildPlotGraphStatus', () => {
  it('returns empty string when no graph exists', () => {
    expect(buildPlotGraphStatus(bookDir)).toBe('')
  })

  it('returns empty string when all setups are resolved', () => {
    addNode(bookDir, { type: 'event', title: 'just an event', description: '', references: [], characters: [], status: 'draft' })
    expect(buildPlotGraphStatus(bookDir)).toBe('')
  })

  it('returns ledger text listing unresolved setups with span', () => {
    addNode(bookDir, { type: 'setup', title: '怀表', description: '北斗七星', references: ['ch01'], characters: [], status: 'draft' })
    addNode(bookDir, { type: 'setup', title: '老照片', description: '', references: ['ch03'], characters: [], status: 'draft' })
    const ledger = buildPlotGraphStatus(bookDir, 'ch07')
    expect(ledger).toContain('剧情账本')
    expect(ledger).toContain('怀表')
    expect(ledger).toContain('ch01')
    expect(ledger).toContain('老照片')
  })
})
