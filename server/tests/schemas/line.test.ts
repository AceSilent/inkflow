import { describe, it, expect } from 'vitest'
import { LineSchema, DirectionSchema, VoiceSchema } from '../../src/schemas/line'

describe('LineSchema', () => {
  it('accepts minimal narration line', () => {
    const parsed = LineSchema.parse({
      id: 'pkg.stage.001',
      text: '中元节。暴雨如注。',
    })
    expect(parsed.type).toBe('narration')
    expect(parsed.speaker).toBeUndefined()
  })

  it('accepts full dialogue line', () => {
    const parsed = LineSchema.parse({
      id: 'pkg.stage.002',
      speaker: '顾听雨',
      text: '你能看见我？',
      type: 'dialogue',
      emotion: 'surprised',
      direction: { bgm: 'tension', sfx: 'ghost_appear' },
      voice: { tone: '轻声，带着不确定' },
    })
    expect(parsed.speaker).toBe('顾听雨')
    expect(parsed.direction?.bgm).toBe('tension')
  })

  it('infers dialogue type when speaker present and type omitted', () => {
    const parsed = LineSchema.parse({
      id: 'pkg.stage.003',
      speaker: '叶尘',
      text: '你是谁？',
    })
    expect(parsed.type).toBe('dialogue')
  })

  it('rejects line without id', () => {
    expect(() => LineSchema.parse({ text: 'hello' })).toThrow()
  })

  it('rejects line without text', () => {
    expect(() => LineSchema.parse({ id: 'x.y.001' })).toThrow()
  })
})
