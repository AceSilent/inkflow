import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createBookTool } from '../src/tools/create-book.js'
import { loadHistoryFull, saveSessionHistory } from '../src/routes/chat-history.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'create-book-tool-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('create_book tool', () => {
  it('creates the same book space as the UI and binds the current session', async () => {
    saveSessionHistory(tmpDir, 'session_agent', [
      { role: 'user', content: '讨论一部墨雨里的复仇小说。' },
    ])

    const created: string[] = []
    const output = await createBookTool.execute(
      { name: '墨雨复仇' },
      {
        bookId: '__unbound__',
        dataDir: tmpDir,
        sessionId: 'session_agent',
        onBookCreated: book => created.push(book.book_id),
      },
    )

    expect(output).toContain('墨雨复仇')
    expect(created).toEqual(['墨雨复仇'])
    expect(fs.existsSync(path.join(tmpDir, '墨雨复仇', '00_Config', 'book_meta.json'))).toBe(true)
    expect(loadHistoryFull(tmpDir, '墨雨复仇').map(m => m.content)).toEqual([
      '讨论一部墨雨里的复仇小说。',
    ])
  })

  it('rejects creation from an already-bound book chat', async () => {
    await expect(createBookTool.execute(
      { name: '第二本书' },
      {
        bookId: 'existing-book',
        dataDir: tmpDir,
        sessionId: 'session_agent',
      },
    )).rejects.toThrow(/unbound/i)

    expect(fs.existsSync(path.join(tmpDir, '第二本书'))).toBe(false)
  })
})
