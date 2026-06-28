import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiBase, resolveApiUrl } from './fetch'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('resolveApiUrl', () => {
  it('keeps relative api URLs in a normal browser dev server', () => {
    expect(resolveApiUrl('/api/v1/books')).toBe('/api/v1/books')
  })

  it('points api URLs at the sidecar when running inside the Electron desktop app', () => {
    vi.stubGlobal('window', { __INKFLOW_DESKTOP__: { apiBase: 'http://127.0.0.1:3001' } })

    expect(apiBase()).toBe('http://127.0.0.1:3001')
    expect(resolveApiUrl('/api/v1/books')).toBe('http://127.0.0.1:3001/api/v1/books')
  })

  it('honors an explicit apiBase override', () => {
    expect(resolveApiUrl('/api/v1/books', { apiBase: 'http://127.0.0.1:3001/' })).toBe('http://127.0.0.1:3001/api/v1/books')
  })

  it('does not rewrite non-api URLs', () => {
    vi.stubGlobal('window', { __INKFLOW_DESKTOP__: { apiBase: 'http://127.0.0.1:3001' } })
    expect(resolveApiUrl('/assets/logo.png')).toBe('/assets/logo.png')
    expect(resolveApiUrl('https://example.com/api/v1/books')).toBe('https://example.com/api/v1/books')
  })
})
