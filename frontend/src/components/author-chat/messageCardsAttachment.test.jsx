import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { I18nContext } from '../../i18n/context'
import { MessageBubble } from './MessageCards'

const labels = {
  'authorChat.you': '你',
  'authorChat.author': '作者',
  'authorChat.sentAttachment': '（已发送附件）',
  'authorChat.attachmentCollapsed': '展开',
  'authorChat.attachmentPreview': '查看全文',
  'authorChat.attachmentFull': '收起',
  'authorChat.attachmentLines': '{count} 行',
}

function renderBubble(msg) {
  return renderToStaticMarkup(
    <I18nContext.Provider value={{ t: key => labels[key] || key }}>
      <MessageBubble msg={msg} />
    </I18nContext.Provider>
  )
}

describe('MessageBubble attachment rendering', () => {
  it('renders each uploaded file as a separate collapsible code block', () => {
    const html = renderBubble({
      role: 'user',
      content: '请读取',
      attachments: [
        { name: 'outline.md', size: 1280, content: '# 标题\n内容', type: 'text/markdown' },
        { name: 'script.py', size: 410, content: 'print("hi")', type: 'text/x-python' },
      ],
    })

    expect(html.match(/chat-attachment-code-block/g)).toHaveLength(2)
    expect(html).toContain('outline.md')
    expect(html).toContain('script.py')
    expect(html).toContain('markdown')
    expect(html).toContain('python')
    expect(html).toContain('请读取')
    expect(html).not.toContain('--- 附件')
  })
})
