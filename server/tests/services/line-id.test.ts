import { describe, it, expect } from 'vitest'
import { generateLineIds, detectIdCollisions } from '../../src/services/line-id'

describe('generateLineIds', () => {
  it('generates sequential IDs for lines without IDs', () => {
    const lines = [
      { text: 'First line' },
      { text: 'Second line' },
    ]
    const withIds = generateLineIds('pkg', 'arrival', lines)
    expect(withIds[0].id).toBe('pkg.arrival.001')
    expect(withIds[1].id).toBe('pkg.arrival.002')
  })

  it('preserves existing IDs', () => {
    const lines = [
      { id: 'custom_id', text: 'Keep this' },
      { text: 'Generate this' },
    ]
    const withIds = generateLineIds('pkg', 'stage', lines)
    expect(withIds[0].id).toBe('custom_id')
    expect(withIds[1].id).toBe('pkg.stage.002')
  })
})

describe('detectIdCollisions', () => {
  it('returns empty for unique IDs', () => {
    const lines = [
      { id: 'a.b.001', text: 'x' },
      { id: 'a.b.002', text: 'y' },
    ]
    expect(detectIdCollisions(lines)).toEqual([])
  })

  it('reports duplicate IDs', () => {
    const lines = [
      { id: 'a.b.001', text: 'x' },
      { id: 'a.b.001', text: 'y' },
    ]
    const collisions = detectIdCollisions(lines)
    expect(collisions).toContain('a.b.001')
  })
})
