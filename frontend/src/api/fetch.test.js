import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiBase, resolveApiUrl } from './fetch'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('resolveApiUrl', () => {
  it('keeps relative api URLs in a normal browser dev server', () => {
    expect(resolveApiUrl('/api/v1/books', { isTauri: false })).toBe('/api/v1/books')
  })

  it('points api URLs at the sidecar when running inside Tauri', () => {
    expect(resolveApiUrl('/api/v1/books', { isTauri: true })).toBe('http://127.0.0.1:3001/api/v1/books')
  })

  it('detects the packaged Tauri custom protocol even before globals are ready', () => {
    vi.stubGlobal('window', { location: { protocol: 'tauri:' } })

    expect(apiBase()).toBe('http://127.0.0.1:3001')
    expect(resolveApiUrl('/api/v1/books')).toBe('http://127.0.0.1:3001/api/v1/books')
  })

  it('does not rewrite non-api URLs', () => {
    expect(resolveApiUrl('/assets/logo.png', { isTauri: true })).toBe('/assets/logo.png')
    expect(resolveApiUrl('https://example.com/api/v1/books', { isTauri: true })).toBe('https://example.com/api/v1/books')
  })
})
