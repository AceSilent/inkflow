import { describe, expect, it } from 'vitest'
import { clearConsumedChapterAsk, isChapterAskForBook } from './chapterAskRequest'

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
})
