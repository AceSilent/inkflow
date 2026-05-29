import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { I18nContext } from '../../i18n/context'
import { NoBookChatStarter } from '../AuthorChatPanel'

const labels = {
  'authorChat.noBookPlaceholder': '描述你的作品、主角或一个场面...',
  'authorChat.attachFile': '添加文件',
  'authorChat.send': '发送',
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
    expect(html).not.toContain('创建作品')
  })
})
