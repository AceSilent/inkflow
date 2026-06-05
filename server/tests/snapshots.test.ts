import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { createSnapshot, listSnapshots, restoreSnapshot } from '../src/snapshots/snapshots.js'

const TEST_DIR = path.join(process.cwd(), '__test_snapshots__')
const BOOK_ID = 'book-1'

function cleanDir(): void {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true })
  }
}

beforeEach(() => {
  cleanDir()
  const bookDir = path.join(TEST_DIR, BOOK_ID)
  fs.mkdirSync(path.join(bookDir, '02_Outlines'), { recursive: true })
  fs.mkdirSync(path.join(bookDir, '.snapshots', 'old_snap'), { recursive: true })
  fs.mkdirSync(path.join(bookDir, '.inkflow', 'observations'), { recursive: true })
  fs.writeFileSync(path.join(bookDir, '02_Outlines', 'outline.json'), '{"ok":true}', 'utf8')
  fs.writeFileSync(path.join(bookDir, 'audit_log.jsonl'), '{"tool":"x"}\n', 'utf8')
  fs.writeFileSync(path.join(bookDir, 'chapter.md.bak'), 'backup', 'utf8')
  fs.writeFileSync(path.join(bookDir, '.snapshots', 'old_snap', 'leak.txt'), 'old', 'utf8')
  fs.writeFileSync(path.join(bookDir, '.inkflow', 'observations', 'working_set.json'), '{}', 'utf8')
})

afterEach(() => {
  cleanDir()
})

describe('snapshots', () => {
  it('creates a snapshot inside the book directory without recursively copying .snapshots', () => {
    const meta = createSnapshot(TEST_DIR, BOOK_ID, 'before send')
    const snapDir = path.join(TEST_DIR, BOOK_ID, '.snapshots', meta.id)

    expect(fs.existsSync(snapDir)).toBe(true)
    expect(fs.existsSync(path.join(snapDir, '_meta.json'))).toBe(true)
    expect(fs.existsSync(path.join(snapDir, '02_Outlines', 'outline.json'))).toBe(true)
    expect(fs.existsSync(path.join(snapDir, '.snapshots'))).toBe(false)
    expect(fs.existsSync(path.join(snapDir, '.inkflow'))).toBe(false)
    expect(fs.existsSync(path.join(snapDir, 'audit_log.jsonl'))).toBe(false)
    expect(fs.existsSync(path.join(snapDir, 'chapter.md.bak'))).toBe(false)
    expect(listSnapshots(TEST_DIR, BOOK_ID)[0].id).toBe(meta.id)
  })

  it('drops snapshots newer than the restored checkpoint', async () => {
    const outlinePath = path.join(TEST_DIR, BOOK_ID, '02_Outlines', 'outline.json')
    const first = createSnapshot(TEST_DIR, BOOK_ID, 'first prompt')

    await new Promise(resolve => setTimeout(resolve, 2))
    fs.writeFileSync(outlinePath, '{"ok":false}', 'utf8')
    const second = createSnapshot(TEST_DIR, BOOK_ID, 'second prompt')

    expect(listSnapshots(TEST_DIR, BOOK_ID).map(s => s.id)).toContain(second.id)

    restoreSnapshot(TEST_DIR, BOOK_ID, first.id)

    const remaining = listSnapshots(TEST_DIR, BOOK_ID).map(s => s.id)
    expect(remaining).toContain(first.id)
    expect(remaining).not.toContain(second.id)
    expect(fs.readFileSync(outlinePath, 'utf8')).toBe('{"ok":true}')
  })
})
