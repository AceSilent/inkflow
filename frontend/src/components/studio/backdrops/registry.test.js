import { describe, expect, it } from 'vitest'
import { BACKDROP_INITS, DEFAULT_BACKDROP_THEME, getBackdropInit } from './index'

describe('backdrop registry', () => {
  it('maps each theme to an init function', () => {
    for (const theme of ['ink', 'mist', 'paper', 'graphite']) {
      expect(typeof BACKDROP_INITS[theme]).toBe('function')
    }
  })

  it('falls back to the default theme for unknown ids', () => {
    expect(getBackdropInit('nonsense')).toBe(BACKDROP_INITS[DEFAULT_BACKDROP_THEME])
    expect(getBackdropInit(undefined)).toBe(BACKDROP_INITS[DEFAULT_BACKDROP_THEME])
  })

  it('returns the exact init for a known theme', () => {
    expect(getBackdropInit('mist')).toBe(BACKDROP_INITS.mist)
    expect(getBackdropInit('graphite')).toBe(BACKDROP_INITS.graphite)
  })
})
