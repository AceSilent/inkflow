import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  listBooks,
  getBook,
  createBook,
  deleteBook,
  explorerTree,
  type BookMeta,
} from '../src/routes/books.js'

const TEST_DIR = path.join(process.cwd(), '__test_books__')

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

describe('Books CRUD', () => {
  it('should list zero books when directory is empty', () => {
    const books = listBooks(TEST_DIR)
    expect(books).toEqual([])
  })

  it('should create a book with full directory structure', () => {
    const meta: BookMeta = {
      book_id: 'test-book-001',
      title: '测试小说',
      genre: '仙侠',
      tone: 'dark',
      concept: '雾港里的失踪作家留下会改写记忆的地图。',
      target_words: 100000,
    }

    const result = createBook(TEST_DIR, meta)

    expect(result.book_id).toBe('test-book-001')
    expect(result.title).toBe('测试小说')
    expect(result.created_at).toBeTruthy()

    // Verify directories exist
    const bookDir = path.join(TEST_DIR, 'test-book-001')
    expect(fs.existsSync(path.join(bookDir, '00_Config'))).toBe(true)
    expect(fs.existsSync(path.join(bookDir, '01_Global_Settings'))).toBe(true)
    expect(fs.existsSync(path.join(bookDir, '02_Outlines'))).toBe(true)
    expect(fs.existsSync(path.join(bookDir, 'memory'))).toBe(true)

    // Verify meta file
    const metaFile = path.join(bookDir, '00_Config', 'book_meta.json')
    expect(fs.existsSync(metaFile)).toBe(true)
    const written = JSON.parse(fs.readFileSync(metaFile, 'utf-8'))
    expect(written.book_id).toBe('test-book-001')
    expect(written.title).toBe('测试小说')
    expect(written.genre).toBe('仙侠')
    expect(written.tone).toBe('dark')
    expect(written.concept).toBe('雾港里的失踪作家留下会改写记忆的地图。')
    expect(written.target_words).toBe(100000)
    expect(written.created_at).toBeTruthy()
  })

  it('should get a single book by id', () => {
    const meta: BookMeta = {
      book_id: 'my-book',
      title: '我的书',
      genre: '玄幻',
      tone: 'light',
      target_words: 200000,
    }
    createBook(TEST_DIR, meta)

    const book = getBook(TEST_DIR, 'my-book')
    expect(book).not.toBeNull()
    expect(book!.book_id).toBe('my-book')
    expect(book!.title).toBe('我的书')
  })

  it('should delete a book directory', () => {
    const meta: BookMeta = {
      book_id: 'to-delete',
      title: '删我',
      genre: '都市',
      tone: 'humor',
      target_words: 50000,
    }
    createBook(TEST_DIR, meta)
    expect(fs.existsSync(path.join(TEST_DIR, 'to-delete'))).toBe(true)

    deleteBook(TEST_DIR, 'to-delete')
    expect(fs.existsSync(path.join(TEST_DIR, 'to-delete'))).toBe(false)
  })

  it('should return explorer tree with multiple books', () => {
    createBook(TEST_DIR, {
      book_id: 'book-a',
      title: '小说A',
      genre: '仙侠',
      tone: 'dark',
      target_words: 100000,
    })
    createBook(TEST_DIR, {
      book_id: 'book-b',
      title: '小说B',
      genre: '科幻',
      tone: 'light',
      target_words: 80000,
    })

    const tree = explorerTree(TEST_DIR)
    expect(tree).toHaveLength(2)

    // Each entry should have id, label, type='book', and children
    const ids = tree.map((t: { id: string }) => t.id).sort()
    expect(ids).toEqual(['book-a', 'book-b'])

    const bookA = tree.find((t: { id: string }) => t.id === 'book-a')!
    expect(bookA.label).toBe('小说A')
    expect(bookA.type).toBe('book')
    expect(bookA.children).toBeDefined()
  })

  it('should reject duplicate book_id', () => {
    const meta: BookMeta = {
      book_id: 'dup-book',
      title: '重复',
      genre: '奇幻',
      tone: 'epic',
      target_words: 150000,
    }
    createBook(TEST_DIR, meta)

    expect(() => createBook(TEST_DIR, meta)).toThrow(/already exists/)
  })
})
