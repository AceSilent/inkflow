import { describe, expect, it } from 'vitest'
import { deriveNewBookDraftFromPrompt } from './newBookDraft'

describe('deriveNewBookDraftFromPrompt', () => {
  it('extracts a quoted Chinese title and preserves the full concept', () => {
    expect(deriveNewBookDraftFromPrompt('我想写一本《雾港来信》，讲一个失踪作家留下地图的故事')).toEqual({
      title: '雾港来信',
      concept: '我想写一本《雾港来信》，讲一个失踪作家留下地图的故事',
    })
  })

  it('falls back to a compact title candidate when no title marker exists', () => {
    expect(deriveNewBookDraftFromPrompt('赛博城市里的失眠侦探和会做梦的档案馆')).toEqual({
      title: '赛博城市里的失眠侦探',
      concept: '赛博城市里的失眠侦探和会做梦的档案馆',
    })
  })
})
