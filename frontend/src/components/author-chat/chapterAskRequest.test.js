import { describe, expect, it } from 'vitest'
import {
  annotationStatusAfterChapterAsk,
  clearConsumedChapterAsk,
  isChapterAskForBook,
  shouldDeferChapterAsk,
} from './chapterAskRequest'

describe('chapter ask request lifecycle', () => {
  it('only delivers an annotation question to its source book', () => {
    const request = { id: 'ask-1', bookId: 'book-a', message: '看看这段' }

    expect(isChapterAskForBook(request, { book_id: 'book-a' })).toBe(true)
    expect(isChapterAskForBook(request, { book_id: 'book-b' })).toBe(false)
    expect(isChapterAskForBook({ ...request, bookId: '' }, { book_id: 'book-a' })).toBe(false)
  })

  it('clears only the request that acknowledged consumption', () => {
    const request = { id: 'ask-new', bookId: 'book-a', message: 'new' }

    expect(clearConsumedChapterAsk(request, 'ask-new')).toBeNull()
    expect(clearConsumedChapterAsk(request, 'ask-old')).toBe(request)
  })

  it('keeps automatic annotation work queued while the author is busy', () => {
    expect(shouldDeferChapterAsk({ autoSend: true }, true)).toBe(true)
    expect(shouldDeferChapterAsk({ autoSend: false }, true)).toBe(false)
    expect(shouldDeferChapterAsk({ autoSend: true }, false)).toBe(false)
  })

  it('resolves annotations only after the agent saves a draft', () => {
    expect(annotationStatusAfterChapterAsk({ toolsUsed: ['read_file', 'save_draft'] })).toBe('resolved')
    expect(annotationStatusAfterChapterAsk({ toolsUsed: ['read_file'] })).toBe('open')
    expect(annotationStatusAfterChapterAsk({ ok: false })).toBe('open')
  })
})
