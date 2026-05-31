import { describe, expect, it, vi } from 'vitest'
import { fetchExplorerTree, normalizeExplorerTree, shouldRetryExplorerFetch } from './sidebarTreeFetch'

describe('sidebar explorer fetch', () => {
  it('retries startup connection failures and returns the explorer tree', async () => {
    const tree = [{ id: 'book-1', label: '雨夜旧书店', type: 'book' }]
    let calls = 0
    const fetchImpl = vi.fn(async () => {
      calls += 1
      if (calls === 1) throw new TypeError('Failed to fetch')
      return {
        ok: true,
        status: 200,
        json: async () => ({ tree }),
      }
    })
    const pause = vi.fn(async () => {})

    const result = await fetchExplorerTree({ fetchImpl, retryDelays: [1], pause })

    expect(result).toEqual({ ok: true, tree, attempts: 2 })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(fetchImpl).toHaveBeenCalledWith('/api/v1/books/explorer')
    expect(pause).toHaveBeenCalledWith(1)
  })

  it('does not retry stable client errors', async () => {
    expect(shouldRetryExplorerFetch({ attempt: 0, maxAttempts: 3, response: { status: 404 } })).toBe(false)
  })

  it('normalizes both legacy arrays and wrapped tree payloads', () => {
    const tree = [{ id: 'book-1' }]

    expect(normalizeExplorerTree(tree)).toBe(tree)
    expect(normalizeExplorerTree({ tree })).toBe(tree)
    expect(normalizeExplorerTree({})).toEqual([])
  })
})
