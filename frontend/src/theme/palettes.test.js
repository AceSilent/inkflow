import { describe, expect, it } from 'vitest'
import { themePalettes, isThemeId } from './palettes'

describe('theme palettes', () => {
  it('offers several OKLCH palettes instead of a binary light/dark toggle', () => {
    expect(themePalettes.length).toBeGreaterThanOrEqual(4)
    expect(themePalettes.map(p => p.id)).toContain('mist')
    expect(themePalettes.every(p => p.swatches.every(color => color.startsWith('oklch(')))).toBe(true)
    expect(themePalettes.every(p => Object.values(p.preview).every(color => color.startsWith('oklch(')))).toBe(true)
  })

  it('validates persisted theme ids', () => {
    expect(isThemeId('ink')).toBe(true)
    expect(isThemeId('missing')).toBe(false)
  })
})
