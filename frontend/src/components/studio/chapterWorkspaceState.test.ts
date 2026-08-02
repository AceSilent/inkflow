import { describe, expect, it } from 'vitest'
import {
  canEditLoadedChapter,
  captureReaderPosition,
  chapterReviewActionLabel,
  chapterReviewStatusLabel,
  chapterWorkspaceKey,
  countCjkAwareWords,
  isDraftDirty,
  normalizeChapterContent,
  readerScrollTopForPosition,
  shouldApplyChapterResult,
  shouldClearLoadErrorOnLoadStart,
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

  it('rejects stale chapter results for another chapter key', () => {
    const chapterKey = chapterWorkspaceKey('book-a', 'ch-1')

    expect(shouldApplyChapterResult(chapterKey, chapterKey)).toBe(true)
    expect(shouldApplyChapterResult(chapterKey, chapterWorkspaceKey('book-a', 'ch-2'))).toBe(false)
  })

  it('keeps refresh failure state during same-chapter retries', () => {
    const chapterKey = chapterWorkspaceKey('book-a', 'ch-1')

    expect(shouldClearLoadErrorOnLoadStart('', chapterKey)).toBe(true)
    expect(shouldClearLoadErrorOnLoadStart(chapterKey, chapterKey)).toBe(false)
    expect(shouldClearLoadErrorOnLoadStart(chapterKey, chapterWorkspaceKey('book-a', 'ch-2'))).toBe(true)
  })

  it('does not replace draft after save when user typed newer content', () => {
    expect(shouldReplaceDraftAfterSave('sent content', 'sent content')).toBe(true)
    expect(shouldReplaceDraftAfterSave('sent content', 'sent content plus more')).toBe(false)
  })

  it('keeps the same reading position across containers with different heights', () => {
    const position = captureReaderPosition({ scrollTop: 600, scrollHeight: 1600, clientHeight: 400 })

    expect(position).toEqual({ top: 600, ratio: 0.5 })
    expect(readerScrollTopForPosition(position, { scrollHeight: 2400, clientHeight: 400 })).toBe(1000)
  })

  it('clamps invalid reading positions to the available scroll range', () => {
    expect(captureReaderPosition({ scrollTop: 900, scrollHeight: 500, clientHeight: 200 }))
      .toEqual({ top: 300, ratio: 1 })
    expect(readerScrollTopForPosition({ ratio: 2 }, { scrollHeight: 500, clientHeight: 200 })).toBe(300)
    expect(readerScrollTopForPosition({ ratio: -1 }, { scrollHeight: 500, clientHeight: 200 })).toBe(0)
  })

  it('blocks editing when loaded content is unknown or refresh failed', () => {
    expect(canEditLoadedChapter(false, true)).toBe(false)
    expect(canEditLoadedChapter(false, false)).toBe(false)
    expect(canEditLoadedChapter(true, true)).toBe(false)
    expect(canEditLoadedChapter(true, false)).toBe(true)
  })

  it('labels human review actions for pre-review, post-review, and approved states', () => {
    expect(chapterReviewActionLabel(null, false)).toBe('人审通过')
    expect(chapterReviewActionLabel(null, true)).toBe('终审通过')
    expect(chapterReviewActionLabel('approved', true)).toBe('已通过')
    expect(chapterReviewStatusLabel(null, false)).toBe('待人审')
    expect(chapterReviewStatusLabel(null, true)).toBe('慢审后待人审')
    expect(chapterReviewStatusLabel('approved', true)).toBe('人类已通过')
    expect(chapterReviewStatusLabel('rejected', false)).toBe('人类已退回')
  })
})
