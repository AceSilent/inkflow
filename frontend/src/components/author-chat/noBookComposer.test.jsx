import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { I18nContext } from '../../i18n/context'
import { ChatComposerBody, NoBookChatStarter } from '../AuthorChatPanel'

const labels = {
  'authorChat.noBookTitle': '先和作者 Agent 聊聊',
  'authorChat.noBookBody': '讨论成熟后再创建作品。',
  'authorChat.noBookPlaceholder': '描述你的作品、主角或一个场面...',
  'authorChat.attachFile': '添加文件',
  'authorChat.send': '发送',
  'authorChat.suggestion1': '我想写一座会改写记忆的城市',
  'authorChat.suggestion2': '帮我比较复仇和救赎两条主线',
  'authorChat.suggestion3': '先问我几个问题来确定题材',
  'authorChat.removeAttachment': '移除附件',
}

function renderNoBookComposer() {
  return renderToStaticMarkup(
    <I18nContext.Provider value={{ t: key => labels[key] || key }}>
      <NoBookChatStarter onCreateBookRequest={() => {}} />
    </I18nContext.Provider>
  )
}

describe('NoBookChatStarter', () => {
  it('uses the normal chat composer shape when no book exists', () => {
    const html = renderNoBookComposer()

    expect(html).toContain('chat-tool-button')
    expect(html).toContain('chat-send-button')
    expect(html).toContain('aria-label="发送"')
    expect(html).toContain('描述你的作品、主角或一个场面...')
    expect(html).toContain('我想写一座会改写记忆的城市')
    expect(html).not.toContain('讨论成熟后再创建作品。')
    expect(html).not.toContain('作者模式')
    expect(html).not.toContain('示例模式')
  })

  it('renders uploaded documents inside the composer body', () => {
    const html = renderToStaticMarkup(
      <I18nContext.Provider value={{ t: key => labels[key] || key }}>
        <div className="chat-composer">
          <ChatComposerBody
            attachments={[{ name: 'notes.md', content: 'hello', size: 2048 }]}
            onRemoveAttachment={() => {}}
          >
            <textarea aria-label="draft" />
          </ChatComposerBody>
        </div>
      </I18nContext.Provider>
    )

    const bodyStart = html.indexOf('class="chat-composer-body"')
    const previewStart = html.indexOf('class="chat-attachment-preview"')
    const textareaStart = html.indexOf('<textarea')
    expect(bodyStart).toBeGreaterThan(-1)
    expect(previewStart).toBeGreaterThan(bodyStart)
    expect(textareaStart).toBeGreaterThan(previewStart)
    expect(html).toContain('notes.md')
  })
})
