import { describe, expect, it } from 'vitest'
import { CHAT_MODES, normalizeChatMode } from './chatModes'

describe('chatModes', () => {
  it('exposes author and game script modes for the composer menu', () => {
    expect(CHAT_MODES.map(mode => mode.id)).toEqual(['author', 'game_script'])
  })

  it('normalizes unknown modes back to author mode', () => {
    expect(normalizeChatMode('game_script')).toBe('game_script')
    expect(normalizeChatMode('unknown')).toBe('author')
    expect(normalizeChatMode()).toBe('author')
  })
})
