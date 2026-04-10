import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  readOutline,
  readLore,
  readPlotTree,
  listChapters,
  getChapterDetail,
} from '../src/routes/data.js'

const TEST_DIR = path.join(process.cwd(), '__test_data__')

function cleanDir(): void {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true })
  }
}

beforeEach(() => {
  cleanDir()
  fs.mkdirSync(TEST_DIR, { recursive: true })
})

afterEach(() => {
  cleanDir()
})

describe('Data read endpoints', () => {
  it('readOutline returns default when no file', () => {
    const result = readOutline(TEST_DIR, 'nonexistent-book')
    expect(result).toEqual({
      id: 'nonexistent-book',
      label: '',
      type: 'book',
      children: [],
    })
  })

  it('readOutline returns parsed JSON when file exists', () => {
    const bookDir = path.join(TEST_DIR, 'my-book', '02_Outlines')
    fs.mkdirSync(bookDir, { recursive: true })
    const outline = {
      id: 'my-book',
      label: 'Test Novel',
      type: 'book',
      children: [
        { id: 'ch1', label: 'Chapter 1', type: 'chapter', status: 'outline', summary: 'Intro' },
      ],
    }
    fs.writeFileSync(
      path.join(bookDir, 'outline.json'),
      JSON.stringify(outline),
      'utf-8'
    )

    const result = readOutline(TEST_DIR, 'my-book')
    expect(result.id).toBe('my-book')
    expect(result.label).toBe('Test Novel')
    expect(result.children).toHaveLength(1)
    expect(result.children[0].id).toBe('ch1')
  })

  it('readLore returns structured data with meta and null for missing files', () => {
    const bookDir = path.join(TEST_DIR, 'lore-book')
    const configDir = path.join(bookDir, '00_Config')
    fs.mkdirSync(configDir, { recursive: true })

    const meta = { book_id: 'lore-book', title: 'Lore Test', genre: 'fantasy', tone: 'dark', target_words: 100000 }
    fs.writeFileSync(
      path.join(configDir, 'book_meta.json'),
      JSON.stringify(meta),
      'utf-8'
    )

    const result = readLore(TEST_DIR, 'lore-book')
    expect(result.meta).toEqual(meta)
    expect(result.world_setting).toBeNull()
    expect(result.characters).toBeNull()
    expect(result.outline).toBeNull()
  })

  it('readPlotTree returns default when no file', () => {
    const result = readPlotTree(TEST_DIR, 'no-tree-book')
    expect(result).toEqual({ nodes: [] })
  })

  it('listChapters returns empty when no outline', () => {
    const result = listChapters(TEST_DIR, 'no-outline-book')
    expect(result).toEqual([])
  })
})
