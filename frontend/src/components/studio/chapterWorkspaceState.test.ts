import { describe, expect, it } from 'vitest'
import { countCjkAwareWords, isDraftDirty, normalizeChapterContent } from './chapterWorkspaceState'

describe('chapter workspace state', () => {
  it('normalizes missing content to empty string', () => {
    expect(normalizeChapterContent(null)).toBe('')
    expect(normalizeChapterContent('  text  ')).toBe('  text  ')
  })

  it('detects dirty drafts by exact content', () => {
    expect(isDraftDirty('abc', 'abc')).toBe(false)
    expect(isDraftDirty('abc', 'abc ')).toBe(true)
  })

  it('counts CJK characters and latin words', () => {
    expect(countCjkAwareWords('雨落在窗上 hello world')).toBe(7)
  })
})
