import { describe, expect, it } from 'vitest'
import { themePalettes, isThemeId } from './palettes'

describe('theme palettes', () => {
  it('offers only the authored Monet and sketch themes', () => {
    expect(themePalettes.map(p => p.id)).toEqual(['monet', 'sketch'])
    expect(themePalettes.every(p => p.artwork.startsWith('/themes/'))).toBe(true)
    expect(themePalettes.every(p => p.swatches.every(color => color.startsWith('oklch(')))).toBe(true)
    expect(themePalettes.every(p => Object.values(p.preview).every(color => color.startsWith('oklch(')))).toBe(true)
  })

  it('validates persisted theme ids', () => {
    expect(isThemeId('monet')).toBe(true)
    expect(isThemeId('sketch')).toBe(true)
    expect(isThemeId('ink')).toBe(false)
    expect(isThemeId('missing')).toBe(false)
  })
})
