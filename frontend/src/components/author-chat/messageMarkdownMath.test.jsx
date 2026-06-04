import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { I18nContext } from '../../i18n/context'
import { MessageBubble } from './MessageCards'

const labels = {
  'authorChat.thinkingCollapsed': '思考已折叠',
  'authorChat.chars': '字',
}

function renderMessage(content) {
  return renderToStaticMarkup(
    <I18nContext.Provider value={{ t: key => labels[key] || key }}>
      <MessageBubble msg={{ role: 'assistant', content }} />
    </I18nContext.Provider>
  )
}

describe('MessageBubble markdown math rendering', () => {
  it('renders inline LaTeX arrows in story chains instead of showing raw syntax', () => {
    const html = renderMessage('劳伦街心脏骤停 $\\rightarrow$ 薇拉的招募 $\\rightarrow$ 案件A异常勒痕')

    expect(html).toContain('→')
    expect(html).toContain('markdown-math-inline')
    expect(html).not.toContain('$\\rightarrow$')
  })
})
