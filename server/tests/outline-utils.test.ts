import { describe, it, expect } from 'vitest'
import { collectChapters, findChapterById, walkOutline } from '../src/utils/outline.js'

const sampleOutline = {
  id: 'book',
  type: 'book',
  label: 'novel',
  children: [
    {
      id: 'vol1',
      type: 'volume',
      label: '第一卷',
      children: [
        { id: 'ch01', type: 'chapter', label: '开篇', summary: 's1', status: 'draft' },
        { id: 'ch02', type: 'chapter', label: '初遇', summary: 's2' },
      ],
    },
    {
      id: 'vol2',
      type: 'volume',
      label: '第二卷',
      children: [
        { id: 'ch03', type: 'chapter', label: '冲突', summary: 's3' },
      ],
    },
  ],
}

describe('walkOutline', () => {
  it('visits every node in document order', () => {
    const seen: string[] = []
    walkOutline(sampleOutline, n => { if (n.id) seen.push(n.id) })
    expect(seen).toEqual(['book', 'vol1', 'ch01', 'ch02', 'vol2', 'ch03'])
  })

  it('skips malformed/non-object roots without throwing', () => {
    expect(() => walkOutline(null, () => {})).not.toThrow()
    expect(() => walkOutline('not an object', () => {})).not.toThrow()
    expect(() => walkOutline(42, () => {})).not.toThrow()
  })
})

describe('collectChapters', () => {
  it('returns only chapter nodes in document order', () => {
    const chapters = collectChapters(sampleOutline)
    expect(chapters.map(c => c.id)).toEqual(['ch01', 'ch02', 'ch03'])
    expect(chapters[0].label).toBe('开篇')
    expect(chapters[0].status).toBe('draft')
    expect(chapters[2].summary).toBe('s3')
  })

  it('returns [] for malformed input', () => {
    expect(collectChapters(null)).toEqual([])
    expect(collectChapters({})).toEqual([])
    expect(collectChapters({ children: 'not array' })).toEqual([])
  })
})

describe('findChapterById', () => {
  it('finds chapter by id across volumes', () => {
    expect(findChapterById(sampleOutline, 'ch01')?.label).toBe('开篇')
    expect(findChapterById(sampleOutline, 'ch03')?.summary).toBe('s3')
  })

  it('returns null for missing chapter or non-chapter id', () => {
    expect(findChapterById(sampleOutline, 'ch99')).toBeNull()
    // vol1 exists but is not a chapter — should still be null.
    expect(findChapterById(sampleOutline, 'vol1')).toBeNull()
  })

  it('returns null for malformed root', () => {
    expect(findChapterById(null, 'ch01')).toBeNull()
    expect(findChapterById('garbage', 'ch01')).toBeNull()
  })
})
