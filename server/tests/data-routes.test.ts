import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  readOutline,
  readLore,
  readPlotTree,
  listChapters,
  getChapterDetail,
  writeOutline,
  readReview,
  writeReview,
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

  it('writeOutline creates file and readOutline reads it back', () => {
    const outline = {
      id: 'write-test',
      label: 'Written Novel',
      type: 'book',
      children: [
        { id: 'v1', label: 'Volume 1', type: 'volume', children: [] },
      ],
    }
    writeOutline(TEST_DIR, 'write-test', outline)

    // Verify file exists
    const filePath = path.join(TEST_DIR, 'write-test', '02_Outlines', 'outline.json')
    expect(fs.existsSync(filePath)).toBe(true)

    // Read back
    const result = readOutline(TEST_DIR, 'write-test')
    expect(result.label).toBe('Written Novel')
    expect(result.children).toHaveLength(1)
  })

  it('writeOutline overwrites existing outline', () => {
    const bookDir = path.join(TEST_DIR, 'overwrite-book', '02_Outlines')
    fs.mkdirSync(bookDir, { recursive: true })
    fs.writeFileSync(
      path.join(bookDir, 'outline.json'),
      JSON.stringify({ id: 'old', label: 'Old Title', type: 'book', children: [] }),
      'utf-8'
    )

    writeOutline(TEST_DIR, 'overwrite-book', { id: 'new', label: 'New Title', type: 'book', children: [] })

    const result = readOutline(TEST_DIR, 'overwrite-book')
    expect(result.label).toBe('New Title')
  })

  it('readReview returns null when no review exists', () => {
    const result = readReview(TEST_DIR, 'no-review-book', 'ch1')
    expect(result).toBeNull()
  })

  it('writeReview creates file and readReview reads it back', () => {
    const review = {
      overall_pass: false,
      feedbacks: [
        { reviewer: 'ai_tone', pass_status: false, issues: [{ type: 'Dash_Abuse', severity: 4 }], quick_comment: '破折号过多' },
      ],
    }
    writeReview(TEST_DIR, 'review-book', 'ch1', review)

    const filePath = path.join(TEST_DIR, 'review-book', '04_Drafts', 'review_ch1.json')
    expect(fs.existsSync(filePath)).toBe(true)

    const result = readReview(TEST_DIR, 'review-book', 'ch1')
    expect(result.overall_pass).toBe(false)
    expect(result.feedbacks).toHaveLength(1)
    expect(result.feedbacks[0].reviewer).toBe('ai_tone')
  })
})
