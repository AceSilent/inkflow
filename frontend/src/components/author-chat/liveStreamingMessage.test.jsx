import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LiveStreamingMessage } from '../AuthorChatPanel'

const labels = {
  'authorChat.retrying': '重试中 {status} 第 {attempt} 次',
  'authorChat.retryAfter': '{seconds}s 后重试',
  'authorChat.retryNow': '正在重试',
}

const t = key => labels[key] || key

describe('LiveStreamingMessage', () => {
  it('keeps the animated thinking state visible after content starts streaming', () => {
    const segments = [{ type: 'content', text: '正在写正文。', streaming: true }]
    const html = renderToStaticMarkup(
      <LiveStreamingMessage
        streamingMsg={{ phase: 'agent_loop', retry: null, segments }}
        visibleStreamingSegments={segments}
        optionsDisabled={false}
        onOptionSelect={() => {}}
        t={t}
      />
    )

    expect(html).toContain('streaming-agent-state-line')
    expect(html).toContain('agent-state-badge')
    expect(html).toContain('agent-shimmer')
    expect(html).toContain('thinking...')
    expect(html).toContain('模型与工具链运行中')
    expect(html).toContain('正在写正文。')
  })
})
