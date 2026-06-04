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
  'authorChat.toolExplored': '已探索 {count} 个文件',
  'authorChat.toolEdited': '已编辑 {count} 个文件',
  'authorChat.toolCalled': '已调用 {count} 个工具',
  'authorChat.toolVerbRead': '读取',
  'authorChat.toolVerbEdited': '已编辑',
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
    expect(html).not.toContain('authorChat.you')
    expect(html).not.toContain('作者')
    expect(html).not.toContain('lucide-user')
  })

  it('renders tool calls as compact activity groups instead of individual cards', () => {
    const html = renderBubble({
      role: 'assistant',
      segments: [
        { type: 'tool_call', name: 'read_file', status: 'done', argsPreview: '{"relative_path":"agent-loop.ts"}' },
        { type: 'tool_call', name: 'read_file', status: 'done', argsPreview: '{"relative_path":"package.json"}' },
        { type: 'content', text: '我看完了。' },
        { type: 'tool_call', name: 'save_draft', status: 'done', argsPreview: '{"file_path":"04_Drafts/ch01.md"}' },
        { type: 'tool_call', name: 'save_outline', status: 'done', argsPreview: '{"file_path":"02_Outline/outline.md"}' },
      ],
    })

    expect(html).toContain('tool-activity-group')
    expect(html).toContain('已探索 2 个文件')
    expect(html).toContain('已编辑 2 个文件')
    expect(html).not.toContain('#00BCD4')
    expect(html).not.toContain('authorChat.author')
    expect(html).not.toContain('lucide-pen-tool')
  })
})
