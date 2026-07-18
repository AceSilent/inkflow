import { describe, expect, it } from 'vitest'
import { presentCompactResult } from './compactResult'

const t = key => ({
  'authorChat.manualCompact': '已压缩 {count} 条',
  'authorChat.manualCompactWithDecay': '已压缩 {count} 条，衰减 {decayed} 条',
  'authorChat.contextCompactedSuccess': '压缩完成',
  'authorChat.compactDecayedOnly': '仅衰减 {count} 条',
  'authorChat.compactOptimized': '整理完成',
  'authorChat.compactUnavailable': '压缩失败',
  'authorChat.compactBreakerTripped': '保护器已开启',
  'authorChat.compactNoHistory': '没有对话',
  'authorChat.compactNoColdHistory': '近期对话无需压缩',
}[key] || key)

describe('presentCompactResult', () => {
  it('does not claim that zero messages were compacted', () => {
    expect(presentCompactResult({ status: 'noop', reason: 'no_cold_history', compactedCount: 0 }, t)).toEqual({
      content: '近期对话无需压缩',
      toast: '近期对话无需压缩',
      tone: 'info',
    })
  })

  it('reports decayed tool history separately from compaction', () => {
    expect(presentCompactResult({ status: 'decayed', decayedCount: 4 }, t).content).toBe('仅衰减 4 条')
  })

  it('reports both operations when compaction succeeds', () => {
    expect(presentCompactResult({ status: 'compacted', compactedCount: 12, decayedCount: 3 }, t).content)
      .toBe('已压缩 12 条，衰减 3 条')
  })

  it('surfaces breaker state without backend English', () => {
    expect(presentCompactResult({ status: 'unavailable', reason: 'breaker_tripped' }, t)).toMatchObject({
      content: '保护器已开启',
      tone: 'warning',
    })
  })
})
