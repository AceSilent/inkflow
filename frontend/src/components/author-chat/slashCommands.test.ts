import { describe, expect, it } from 'vitest'
import { parseSlashCommand } from './slashCommands'

describe('parseSlashCommand', () => {
  it('parses compact', () => {
    expect(parseSlashCommand('/compact')).toEqual({ type: 'compact' })
  })

  it('parses compact with surrounding whitespace', () => {
    expect(parseSlashCommand('  /compact  ')).toEqual({ type: 'compact' })
  })

  it('parses clear', () => {
    expect(parseSlashCommand('/clear')).toEqual({ type: 'clear' })
  })

  it('returns null for clear with extra text', () => {
    expect(parseSlashCommand('/clear now')).toBeNull()
  })

  it('parses remember with text', () => {
    expect(parseSlashCommand('/remember keep this')).toEqual({ type: 'remember', text: 'keep this' })
  })

  it('returns null for remember without text', () => {
    expect(parseSlashCommand('/remember')).toBeNull()
  })

  it('returns null for normal messages', () => {
    expect(parseSlashCommand('write the next chapter')).toBeNull()
  })
})
