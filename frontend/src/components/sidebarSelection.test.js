import { describe, expect, it } from 'vitest'
import { resolveRestoredBookSelection } from './sidebarSelection'

describe('resolveRestoredBookSelection', () => {
  it('restores the saved book when no node is selected yet', () => {
    const books = [
      { id: 'book-a', label: 'Book A' },
      { id: 'book-b', label: 'Book B' },
    ]

    const result = resolveRestoredBookSelection({
      books,
      savedBookId: 'book-a',
      selectedNodeId: null,
      selectedBookId: null,
    })

    expect(result).toEqual({ restored: books[0], nextSelectedNodeId: 'book-a' })
  })

  it('does not reselect the book while a chapter from that book is selected', () => {
    const books = [{ id: 'book-a', label: 'Book A' }]

    const result = resolveRestoredBookSelection({
      books,
      savedBookId: 'book-a',
      selectedNodeId: 'ch01',
      selectedBookId: 'book-a',
    })

    expect(result).toEqual({ restored: null, nextSelectedNodeId: 'ch01' })
  })

  it('reselects the saved book when it differs from the current book', () => {
    const books = [
      { id: 'book-a', label: 'Book A' },
      { id: 'book-b', label: 'Book B' },
    ]

    const result = resolveRestoredBookSelection({
      books,
      savedBookId: 'book-b',
      selectedNodeId: 'ch01',
      selectedBookId: 'book-a',
    })

    expect(result).toEqual({ restored: books[1], nextSelectedNodeId: 'book-b' })
  })
})
