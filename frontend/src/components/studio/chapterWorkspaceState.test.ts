import { describe, expect, it } from 'vitest'
import {
  canEditLoadedChapter,
  chapterWorkspaceKey,
  countCjkAwareWords,
  isDraftDirty,
  normalizeChapterContent,
  shouldApplySaveResult,
  shouldPreserveDirtyDraft,
  shouldReplaceDraftAfterSave,
} from './chapterWorkspaceState'

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

  it('preserves dirty drafts only during same-chapter reloads', () => {
    const chapterKey = chapterWorkspaceKey('book-a', 'ch-1')

    expect(shouldPreserveDirtyDraft(chapterKey, chapterKey, 'old draft', 'edited draft')).toBe(true)
    expect(shouldPreserveDirtyDraft(chapterKey, chapterWorkspaceKey('book-a', 'ch-2'), 'old draft', 'edited draft')).toBe(false)
    expect(shouldPreserveDirtyDraft(chapterKey, chapterKey, 'clean draft', 'clean draft')).toBe(false)
  })

  it('rejects stale save results for another chapter key', () => {
    const chapterKey = chapterWorkspaceKey('book-a', 'ch-1')

    expect(shouldApplySaveResult(chapterKey, chapterKey)).toBe(true)
    expect(shouldApplySaveResult(chapterKey, chapterWorkspaceKey('book-a', 'ch-2'))).toBe(false)
  })

  it('does not replace draft after save when user typed newer content', () => {
    expect(shouldReplaceDraftAfterSave('sent content', 'sent content')).toBe(true)
    expect(shouldReplaceDraftAfterSave('sent content', 'sent content plus more')).toBe(false)
  })

  it('blocks editing when loaded content is unknown after failure', () => {
    expect(canEditLoadedChapter(false, true)).toBe(false)
    expect(canEditLoadedChapter(false, false)).toBe(false)
    expect(canEditLoadedChapter(true, true)).toBe(true)
    expect(canEditLoadedChapter(true, false)).toBe(true)
  })
})
