import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBookFromDraft, createBookId } from './createBookFromDraft'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createBookFromDraft', () => {
  it('builds stable safe book ids from Chinese titles', () => {
    expect(createBookId('《雾港来信》', 0)).toBe('雾港来信_0')
    expect(createBookId('A very loud title!!!', 36)).toBe('a_very_loud_title_10')
  })

  it('posts a minimal unspecified-genre book payload', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ book_id: '雾港来信_0', title: '雾港来信' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await createBookFromDraft({ title: '雾港来信', concept: '失踪作家和记忆城市' })

    expect(result).toEqual({ book_id: '雾港来信_0', title: '雾港来信' })
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/books', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: expect.stringContaining('"genre":"unspecified"'),
    })
  })
})
