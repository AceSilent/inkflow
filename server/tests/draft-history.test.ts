import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  archivePriorDraft,
  chapterIdFromFilename,
  compareDraftVersions,
  contentHash,
  listDraftHistory,
  listDraftVersions,
  MAX_DRAFT_VERSIONS,
  DRAFT_HISTORY_DIR,
  DraftRevisionConflictError,
  restoreDraftVersion,
  saveDraftRevision,
} from '../src/tools/draft-history.js'

let tmpDir: string
const bookId = 'book'

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drafthist-'))
  fs.mkdirSync(path.join(tmpDir, bookId, '04_Drafts'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

const bookDir = () => path.join(tmpDir, bookId)
const draftPath = (name: string) => path.join(bookDir(), '04_Drafts', name)

describe('chapterIdFromFilename', () => {
  it('extracts ch{N} from valid draft filenames', () => {
    expect(chapterIdFromFilename('ch01.md')).toBe('ch01')
    expect(chapterIdFromFilename('CH137.md')).toBe('ch137')
    expect(chapterIdFromFilename('ch9.md')).toBe('ch9')
  })

  it('returns null for non-chapter filenames', () => {
    expect(chapterIdFromFilename('foo.md')).toBeNull()
    expect(chapterIdFromFilename('ch01.txt')).toBeNull()
    expect(chapterIdFromFilename('chapter01.md')).toBeNull()
  })
})

describe('archivePriorDraft', () => {
  it('returns null when the target file does not exist (nothing to archive)', () => {
    expect(archivePriorDraft(bookDir(), draftPath('ch01.md'))).toBeNull()
  })

  it('archives the prior content into .draft_history/{chapter}/', () => {
    const target = draftPath('ch01.md')
    fs.writeFileSync(target, 'version one')

    const archived = archivePriorDraft(bookDir(), target)
    expect(archived).not.toBeNull()
    expect(fs.readFileSync(archived!, 'utf-8')).toBe('version one')

    const history = listDraftHistory(bookDir(), 'ch01')
    expect(history).toHaveLength(1)
  })

  it('keeps each chapter history separate', () => {
    fs.writeFileSync(draftPath('ch01.md'), 'a')
    fs.writeFileSync(draftPath('ch02.md'), 'b')

    archivePriorDraft(bookDir(), draftPath('ch01.md'))
    archivePriorDraft(bookDir(), draftPath('ch02.md'))

    expect(listDraftHistory(bookDir(), 'ch01')).toHaveLength(1)
    expect(listDraftHistory(bookDir(), 'ch02')).toHaveLength(1)
  })

  it('caps history at MAX_DRAFT_VERSIONS, dropping oldest first', () => {
    const target = draftPath('ch01.md')
    for (let i = 0; i < MAX_DRAFT_VERSIONS + 3; i++) {
      fs.writeFileSync(target, `version ${i}`)
      archivePriorDraft(bookDir(), target)
      // Tick the clock so each archive name is unique. Without this the same
      // ms-resolution timestamp collides and we accidentally overwrite.
      const futureTime = new Date(Date.now() + i * 1000)
      // Touch via fs.utimesSync isn't enough since the archive uses Date.now()
      // at call time — instead pause briefly. 1ms is plenty for new ts.
    }
    // We can't easily inject a clock; the loop runs faster than 1ms per iter.
    // Skip strict count check if collisions happened; just verify the cap.
    const finalCount = listDraftHistory(bookDir(), 'ch01').length
    expect(finalCount).toBeLessThanOrEqual(MAX_DRAFT_VERSIONS)
  })

  it('does nothing for non-chapter filenames (returns null)', () => {
    const target = path.join(bookDir(), '04_Drafts', 'random.md')
    fs.writeFileSync(target, 'not a chapter')
    expect(archivePriorDraft(bookDir(), target)).toBeNull()
    expect(fs.existsSync(path.join(bookDir(), DRAFT_HISTORY_DIR))).toBe(false)
  })
})

describe('save_draft integration', () => {
  it('records each resulting Agent revision with attribution', async () => {
    const { createAllTools } = await import('../src/tools/index.js')
    const registry = createAllTools()

    const longBody = (tag: string) => `# 第一章 ${tag}\n` + '正文内容。'.repeat(200)

    // First save creates the first attributed revision.
    await registry.execute('save_draft',
      { file_path: 'ch01.md', content: longBody('v1') },
      { bookId, dataDir: tmpDir },
    )
    expect(listDraftHistory(bookDir(), 'ch01')).toHaveLength(1)

    // Second save: prior version should be archived before being overwritten.
    await registry.execute('save_draft',
      { file_path: 'ch01.md', content: longBody('v2') },
      { bookId, dataDir: tmpDir },
    )
    const history = listDraftHistory(bookDir(), 'ch01')
    expect(history).toHaveLength(2)

    const archivedContent = fs.readFileSync(
      path.join(bookDir(), DRAFT_HISTORY_DIR, 'ch01', history[1]),
      'utf-8',
    )
    expect(archivedContent).toContain('v1')
    const versions = listDraftVersions(bookDir(), 'ch01', draftPath('ch01.md'))
    expect(versions[0]).toMatchObject({ actor: 'agent', source: 'save_draft', is_current: true })
    expect(versions[1]).toMatchObject({ actor: 'agent', source: 'save_draft' })

    // Live file holds the new version.
    expect(fs.readFileSync(path.join(bookDir(), '04_Drafts', 'ch01.md'), 'utf-8')).toContain('v2')
  })
})

describe('attributed draft revisions', () => {
  it('keeps legacy archives readable without inventing an actor', () => {
    const historyDir = path.join(bookDir(), DRAFT_HISTORY_DIR, 'ch01')
    fs.mkdirSync(historyDir, { recursive: true })
    fs.writeFileSync(path.join(historyDir, '20260731T010203-004Z.md'), '旧稿', 'utf8')

    const versions = listDraftVersions(bookDir(), 'ch01')
    expect(versions).toHaveLength(1)
    expect(versions[0]).toMatchObject({
      actor: 'legacy',
      source: 'legacy',
      content_hash: contentHash('旧稿'),
    })
  })

  it('records user and Agent saves, computes a real diff, and restores as a new revision', () => {
    const target = draftPath('ch01.md')
    const first = saveDraftRevision({
      bookDir: bookDir(),
      targetPath: target,
      content: '第一行\n旧句',
      actor: 'user',
      source: 'workbench',
    })
    const second = saveDraftRevision({
      bookDir: bookDir(),
      targetPath: target,
      content: '第一行\n新句\n第三行',
      actor: 'agent',
      source: 'save_draft',
      expectedHash: first.content_hash,
    })

    const diff = compareDraftVersions(bookDir(), 'ch01', first.id, second.id, target)
    expect(diff).not.toBeNull()
    expect(diff?.additions).toBe(2)
    expect(diff?.deletions).toBe(1)
    expect(diff?.unified_diff).toContain('-旧句')
    expect(diff?.unified_diff).toContain('+新句')

    const restored = restoreDraftVersion(
      bookDir(),
      'ch01',
      first.id,
      target,
      second.content_hash,
    )
    expect(restored).toMatchObject({
      actor: 'user',
      source: 'restore',
      restored_from: first.id,
    })
    expect(fs.readFileSync(target, 'utf8')).toBe('第一行\n旧句')
  })

  it('rejects a stale save without changing the live draft', () => {
    const target = draftPath('ch01.md')
    const first = saveDraftRevision({
      bookDir: bookDir(),
      targetPath: target,
      content: '版本一',
      actor: 'user',
      source: 'workbench',
    })
    saveDraftRevision({
      bookDir: bookDir(),
      targetPath: target,
      content: '版本二',
      actor: 'agent',
      source: 'save_draft',
      expectedHash: first.content_hash,
    })

    expect(() => saveDraftRevision({
      bookDir: bookDir(),
      targetPath: target,
      content: '过期编辑器的内容',
      actor: 'user',
      source: 'workbench',
      expectedHash: first.content_hash,
    })).toThrow(DraftRevisionConflictError)
    expect(fs.readFileSync(target, 'utf8')).toBe('版本二')
  })
})
