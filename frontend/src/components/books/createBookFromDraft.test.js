import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBookFromDraft, createBookId } from './createBookFromDraft'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createBookFromDraft', () => {
  it('builds stable safe book ids from Chinese titles', () => {
    expect(createBookId('《雾港来信》')).toBe('雾港来信')
    expect(createBookId('A very loud title!!!')).toBe('a_very_loud_title')
  })

  it('posts a lightweight book-space payload and binds the draft session', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ book_id: '雾港来信', title: '雾港来信' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await createBookFromDraft({ name: '雾港来信', sourceSessionId: 'session_123' })

    expect(result).toEqual({ book_id: '雾港来信', title: '雾港来信' })
    const request = fetchMock.mock.calls[0][1]
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/books', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: expect.any(String),
    })
    expect(JSON.parse(request.body)).toMatchObject({
      book_id: '雾港来信',
      title: '雾港来信',
      genre: 'unspecified',
      tone: 'unspecified',
      source_session_id: 'session_123',
    })
  })
})
