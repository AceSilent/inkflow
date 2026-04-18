import { describe, it, expect } from 'vitest'
import { zoneByTokens, estimateMessageTokens, DEFAULT_ZONE_BOUNDARIES } from '../src/context/zones.js'
import type { ModelMessage } from 'ai'

const short: ModelMessage = { role: 'user', content: '好' }
const medium: ModelMessage = { role: 'assistant', content: 'A'.repeat(2500) }  // ~1000 tokens
const huge: ModelMessage = { role: 'assistant', content: 'X'.repeat(60000) }   // ~24000 tokens

describe('estimateMessageTokens', () => {
  it('estimates token count from char length / 2.5', () => {
    expect(estimateMessageTokens({ role: 'user', content: 'X'.repeat(100) })).toBe(40)
  })
  it('handles object content (serialized)', () => {
    const m: ModelMessage = { role: 'assistant', content: [{ type: 'text', text: 'hello' }] as any }
    expect(estimateMessageTokens(m)).toBeGreaterThan(0)
  })
})

describe('zoneByTokens', () => {
  it('all short messages in Hot', () => {
    const msgs = Array.from({ length: 30 }, () => short)
    const { hot, warm, cold } = zoneByTokens(msgs)
    expect(hot.length).toBe(30)
    expect(warm.length).toBe(0)
    expect(cold.length).toBe(0)
  })

  it('long context split into 3 zones', () => {
    // 80 medium (~80k tok) + enough oldest shorts to overflow hot/warm gaps + 10 short newest
    const msgs: ModelMessage[] = [
      ...Array.from({ length: 1000 }, () => short),   // oldest — enough to overflow remaining hot/warm budget
      ...Array.from({ length: 80 }, () => medium),    // ~80k tok middle
      ...Array.from({ length: 10 }, () => short),     // newest
    ]
    const { hot, warm, cold } = zoneByTokens(msgs)
    expect(hot.length + warm.length + cold.length).toBe(msgs.length)
    // Hot should contain mostly short (newest), bounded by hotTokens
    expect(hot[hot.length - 1]).toBe(short)
    // Cold should include the oldest short messages
    expect(cold[0]).toBe(short)
    // Sanity: cold must be non-empty
    expect(cold.length).toBeGreaterThan(0)
  })

  it('a single huge message alone can fill Hot+Warm', () => {
    const msgs = [huge, short, short]  // huge oldest, then 2 short newest
    const { hot, warm, cold } = zoneByTokens(msgs)
    // 2 short in hot, huge overflows to warm
    expect(hot).toEqual([short, short])
    expect(warm).toEqual([huge])
  })

  it('respects custom boundaries', () => {
    const msgs = Array.from({ length: 5 }, () => medium)  // ~5000 tokens
    const { hot, warm } = zoneByTokens(msgs, { hotTokens: 2000, warmTokens: 2000 })
    expect(hot.length).toBeLessThan(msgs.length)
    expect(warm.length).toBeGreaterThan(0)
  })
})
