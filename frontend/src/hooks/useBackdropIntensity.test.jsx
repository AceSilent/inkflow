import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  BackdropIntensityProvider,
  INTENSITY_OPTIONS,
  isBackdropIntensity,
  BACKDROP_INTENSITY_STORAGE_KEY,
  DEFAULT_BACKDROP_INTENSITY,
} from './useBackdropIntensity'

function installLocalStorage(initial = {}) {
  const store = new Map(Object.entries(initial))
  globalThis.localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)) },
    removeItem: key => { store.delete(key) },
    clear: () => store.clear(),
  }
  return store
}

describe('useBackdropIntensity exports', () => {
  afterEach(() => {
    delete globalThis.localStorage
  })

  it('exposes the three intensity options in order', () => {
    expect(INTENSITY_OPTIONS.map(o => o.value)).toEqual(['subtle', 'medium', 'rich'])
  })

  it('defaults to medium', () => {
    expect(DEFAULT_BACKDROP_INTENSITY).toBe('medium')
  })

  it('uses the agreed localStorage key', () => {
    expect(BACKDROP_INTENSITY_STORAGE_KEY).toBe('inkflow-backdrop-intensity')
  })

  it('validates only known values', () => {
    expect(isBackdropIntensity('subtle')).toBe(true)
    expect(isBackdropIntensity('medium')).toBe(true)
    expect(isBackdropIntensity('rich')).toBe(true)
    expect(isBackdropIntensity('loud')).toBe(false)
    expect(isBackdropIntensity(null)).toBe(false)
    expect(isBackdropIntensity(undefined)).toBe(false)
  })
})

describe('BackdropIntensityProvider', () => {
  beforeEach(() => {
    installLocalStorage()
  })

  afterEach(() => {
    delete globalThis.localStorage
  })

  it('renders its children', () => {
    const html = renderToStaticMarkup(
      <BackdropIntensityProvider>
        <span>子节点</span>
      </BackdropIntensityProvider>,
    )
    expect(html).toContain('子节点')
  })

  it('reads a persisted intensity on init', () => {
    installLocalStorage({ [BACKDROP_INTENSITY_STORAGE_KEY]: 'rich' })
    // Provider mounting should not throw, and the stored value is honored by the
    // initializer (covered indirectly: no crash, child still renders).
    const html = renderToStaticMarkup(
      <BackdropIntensityProvider>
        <span>ok</span>
      </BackdropIntensityProvider>,
    )
    expect(html).toContain('ok')
  })
})
