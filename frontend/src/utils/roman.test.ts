import { describe, it, expect } from 'vitest'
import { toRoman } from './roman'

describe('toRoman', () => {
  it('returns empty string for 0 or negative', () => {
    expect(toRoman(0)).toBe('')
    expect(toRoman(-1)).toBe('')
  })

  it('converts 1-10 correctly', () => {
    const expected = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
    for (let i = 1; i <= 10; i++) {
      expect(toRoman(i)).toBe(expected[i - 1])
    }
  })

  it('handles tens', () => {
    expect(toRoman(14)).toBe('XIV')
    expect(toRoman(40)).toBe('XL')
    expect(toRoman(90)).toBe('XC')
  })

  it('handles hundreds (chapter counts up to 300+)', () => {
    expect(toRoman(100)).toBe('C')
    expect(toRoman(137)).toBe('CXXXVII')
    expect(toRoman(399)).toBe('CCCXCIX')
  })

  it('caps at 3999 by returning the input as string when out of range', () => {
    expect(toRoman(5000)).toBe('5000')
  })
})
