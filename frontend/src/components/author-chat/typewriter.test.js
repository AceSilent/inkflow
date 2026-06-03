import { describe, expect, it } from 'vitest'
import {
  applyStreamingPreview,
  latestStreamingContentTarget,
  nextTypewriterFrame,
} from './typewriter'

describe('author chat streaming typewriter helpers', () => {
  it('reveals live text in smooth bounded frames until it catches the target', () => {
    const target = '这是一段正在生成的正文，会逐字落到对话里。'

    const first = nextTypewriterFrame('', target)

    expect(first.length).toBeGreaterThan(0)
    expect(first.length).toBeLessThan(target.length)
    expect(first).toBe(target.slice(0, first.length))

    let current = ''
    for (let i = 0; i < 40; i += 1) {
      current = nextTypewriterFrame(current, target)
    }

    expect(current).toBe(target)
  })

  it('snaps to the target when the server replaces a shorter stream', () => {
    expect(nextTypewriterFrame('abcdef', 'abc')).toBe('abc')
  })

  it('previews only the active streaming content segment without mutating history', () => {
    const segments = [
      { type: 'thinking', text: '分析中' },
      { type: 'content', text: '已完成的一段。' },
      { type: 'content', text: '正在生成的正文。', streaming: true },
      { type: 'tool_call', name: 'save_draft', status: 'running' },
    ]

    const preview = applyStreamingPreview(segments, '正在生成')

    expect(latestStreamingContentTarget(segments)).toBe('正在生成的正文。')
    expect(preview[0]).toEqual(segments[0])
    expect(preview[1].text).toBe('已完成的一段。')
    expect(preview[2].text).toBe('正在生成')
    expect(preview[3]).toEqual(segments[3])
    expect(segments[2].text).toBe('正在生成的正文。')
  })
})
