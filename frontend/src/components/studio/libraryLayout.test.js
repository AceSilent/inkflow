import { describe, expect, it } from 'vitest'
import {
  LIBRARY_COLLAPSED_STORAGE_KEY,
  loadLibraryCollapsed,
  saveLibraryCollapsed,
} from './libraryLayout'

describe('library sidebar layout', () => {
  it('defaults to expanded', () => {
    expect(loadLibraryCollapsed(new Map())).toBe(false)
  })

  it('persists collapsed and expanded states', () => {
    const store = new Map()

    expect(saveLibraryCollapsed(true, store)).toBe(true)
    expect(store.get(LIBRARY_COLLAPSED_STORAGE_KEY)).toBe('true')
    expect(loadLibraryCollapsed(store)).toBe(true)

    expect(saveLibraryCollapsed(false, store)).toBe(false)
    expect(loadLibraryCollapsed(store)).toBe(false)
  })
})
