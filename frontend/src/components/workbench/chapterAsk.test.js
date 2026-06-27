import { describe, expect, it } from 'vitest'
import { buildChapterAskMessage, normalizeChapterAskComment } from './chapterAsk'

describe('chapter ask helpers', () => {
  it('builds a conversational author message from a selected chapter quote', () => {
    const message = buildChapterAskMessage({
      chapterId: 'ch01',
      chapterTitle: '第一章·下山',
      selectedText: '钱守业却抢先一步，横身拦在了棺前。',
      question: '这句动作是不是太直白？',
    })

    expect(message).toContain('章节：第一章·下山（ch01）')
    expect(message).toContain('> 钱守业却抢先一步，横身拦在了棺前。')
    expect(message).toContain('我的问题：这句动作是不是太直白？')
    expect(message).toContain('先讨论，不要直接改稿或保存')
  })

  it('uses a neutral default comment when queued without user text', () => {
    expect(normalizeChapterAskComment('  ')).toBe('请看看这段文字，指出问题并给出修改建议。')
  })
})
