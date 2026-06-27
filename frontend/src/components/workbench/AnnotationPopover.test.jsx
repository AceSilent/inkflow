import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AnnotationPopover } from './AnnotationPopover'

describe('AnnotationPopover', () => {
  it('frames selected text as an ask-author action with queue and direct-send choices', () => {
    const html = renderToStaticMarkup(
      <AnnotationPopover
        anchor={{ x: 12, y: 24 }}
        selectedText="钱守业却抢先一步。"
        onCancel={() => {}}
        onQueue={() => {}}
        onSendNow={() => {}}
      />
    )

    expect(html).toContain('问作者')
    expect(html).toContain('钱守业却抢先一步。')
    expect(html).toContain('先加入待处理')
    expect(html).toContain('立即问作者')
    expect(html).not.toContain('保存')
  })
})
