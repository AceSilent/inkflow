import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { writeMemory } from '../src/memory/memory-service.js'
import {
  ensureObservationMigration,
  loadObservationEvents,
  loadWorkingSet,
  recordToolObservation,
  renderWorkingSetForPrompt,
} from '../src/context/observation-ledger.js'

let parentDir: string
let dataDir: string
const bookId = 'book1'

beforeEach(() => {
  parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'observation-ledger-'))
  dataDir = path.join(parentDir, 'books')
  fs.mkdirSync(path.join(dataDir, bookId, '04_Drafts'), { recursive: true })
  fs.mkdirSync(path.join(dataDir, bookId, '00_Config'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(parentDir, { recursive: true, force: true })
})

function writeHistoryWithRead(): void {
  fs.writeFileSync(
    path.join(dataDir, bookId, 'author_chat_history.json'),
    JSON.stringify([
      { role: 'user', content: '先看第一章' },
      {
        role: 'assistant',
        content: '我看过了。',
        segments: [
          {
            type: 'tool_call',
            name: 'read_file',
            status: 'done',
            argsPreview: '{"relative_path":"04_Drafts/ch01.md"}',
            result: '尸体倒在泥水里，双手交叠在胸前。',
          },
        ],
      },
    ], null, 2),
    'utf8',
  )
}

describe('observation ledger', () => {
  it('migrates legacy chat tool segments into a tool event log and working set', () => {
    writeHistoryWithRead()

    const result = ensureObservationMigration(dataDir, bookId)
    const events = loadObservationEvents(dataDir, bookId)
    const workingSet = loadWorkingSet(dataDir, bookId)
    const prompt = renderWorkingSetForPrompt(dataDir, bookId)

    expect(result.migratedEvents).toBe(1)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      source: 'history_segment',
      toolName: 'read_file',
      status: 'done',
      args: { relative_path: '04_Drafts/ch01.md' },
    })
    expect(events[0].resultPreview).toContain('尸体倒在泥水里')
    expect(workingSet.entries[0]).toMatchObject({
      toolName: 'read_file',
      label: '04_Drafts/ch01.md',
      status: 'active',
    })
    expect(prompt).toContain('工作台观察')
    expect(prompt).toContain('不是长期记忆')
    expect(prompt).toContain('04_Drafts/ch01.md')
    expect(prompt).toContain('尸体倒在泥水里')
  })

  it('records live read_file metadata and invalidates it when the same draft is saved', () => {
    const draftPath = path.join(dataDir, bookId, '04_Drafts', 'ch01.md')
    fs.writeFileSync(draftPath, '旧正文内容。', 'utf8')

    recordToolObservation(dataDir, bookId, 'read_file', { relative_path: '04_Drafts/ch01.md' }, '旧正文内容。')
    recordToolObservation(dataDir, bookId, 'save_draft', { file_path: 'ch01.md' }, 'Draft saved to 04_Drafts/ch01.md')

    const workingSet = loadWorkingSet(dataDir, bookId)
    const readEntry = workingSet.entries.find(entry => entry.toolName === 'read_file')

    expect(readEntry?.source).toMatchObject({
      relativePath: '04_Drafts/ch01.md',
      size: Buffer.byteLength('旧正文内容。'),
    })
    expect(readEntry?.status).toBe('stale')
    expect(readEntry?.staleReason).toContain('save_draft')
  })

  it('keeps only the latest working-set observation for the same resource', () => {
    const draftPath = path.join(dataDir, bookId, '04_Drafts', 'ch01.md')
    fs.writeFileSync(draftPath, '最新版正文。', 'utf8')

    recordToolObservation(dataDir, bookId, 'read_file', { relative_path: '04_Drafts/ch01.md' }, '旧版正文。')
    recordToolObservation(dataDir, bookId, 'read_file', { relative_path: '04_Drafts/ch01.md' }, '最新版正文。')

    const workingSet = loadWorkingSet(dataDir, bookId)
    const readEntries = workingSet.entries.filter(entry => entry.toolName === 'read_file')

    expect(readEntries).toHaveLength(1)
    expect(readEntries[0].excerpt).toContain('最新版正文')
    expect(readEntries[0].label).toBe('04_Drafts/ch01.md')
  })

  it('indexes existing memories without rewriting their markdown files', () => {
    const originalBody = '# 偏好\n\n用户不喜欢旁白讲解。'
    const memoryPath = writeMemory(dataDir, {
      id: 'mem_keep',
      scope: 'book',
      type: 'preference',
      confidence: 0.9,
      tags: ['migration'],
      source: 'manual',
      status: 'active',
      created_at: '2026-06-01T00:00:00.000Z',
      book_id: bookId,
    }, originalBody)
    const before = fs.readFileSync(memoryPath, 'utf8')

    const result = ensureObservationMigration(dataDir, bookId)
    const after = fs.readFileSync(memoryPath, 'utf8')
    const manifest = JSON.parse(fs.readFileSync(path.join(dataDir, bookId, '.inkflow', 'memory_manifest.json'), 'utf8'))

    expect(result.indexedMemories).toBeGreaterThanOrEqual(1)
    expect(after).toBe(before)
    expect(manifest.entries).toEqual([
      expect.objectContaining({
        id: 'mem_keep',
        scope: 'book',
        type: 'preference',
        status: 'active',
        filePath: path.relative(path.join(dataDir, bookId), memoryPath),
      }),
    ])
  })

  it('indexes legacy project memory json files as migrated memory artifacts', () => {
    const legacyDir = path.join(dataDir, bookId, 'memory')
    fs.mkdirSync(legacyDir, { recursive: true })
    fs.writeFileSync(path.join(legacyDir, 'decided_facts.json'), JSON.stringify({ 主角: '艾伦' }), 'utf8')

    ensureObservationMigration(dataDir, bookId)
    const manifest = JSON.parse(fs.readFileSync(path.join(dataDir, bookId, '.inkflow', 'memory_manifest.json'), 'utf8'))

    expect(manifest.entries).toContainEqual(expect.objectContaining({
      id: 'legacy_memory_decided_facts_json',
      scope: 'book',
      type: 'legacy_project_memory',
      status: 'active',
      filePath: path.join('memory', 'decided_facts.json'),
    }))
  })
})
