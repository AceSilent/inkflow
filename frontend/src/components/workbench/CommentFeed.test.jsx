import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CommentFeed } from './CommentFeed'

describe('CommentFeed', () => {
  it('offers direct processing for an open pending annotation', () => {
    const html = renderToStaticMarkup(
      <CommentFeed
        annotations={[{
          id: 'ann-1',
          source: 'user',
          quote: '他停在门外。',
          comment: '这里的动作动机不清楚',
          status: 'open',
        }]}
        onProcess={() => {}}
        onSendBatch={() => {}}
      />
    )

    expect(html).toContain('进行处理')
    expect(html).toContain('全部进行处理（1）')
    expect(html).toContain('定位原文')
    expect(html).toContain('删除')
  })

  it('does not offer processing again after an annotation was sent', () => {
    const html = renderToStaticMarkup(
      <CommentFeed
        annotations={[{
          id: 'ann-1',
          source: 'user',
          quote: '他停在门外。',
          comment: '这里的动作动机不清楚',
          status: 'sent',
        }]}
      />
    )

    expect(html).toContain('已发送给作者')
    expect(html).not.toContain('进行处理')
  })
})
