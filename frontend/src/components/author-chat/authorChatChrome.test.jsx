import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { I18nContext } from '../../i18n/context'
import { AuthorChatPanel } from '../AuthorChatPanel'

const labels = {
  'authorChat.agentTitle': '作者 Agent',
  'authorChat.toolSummary': '25 tools · streaming',
  'authorChat.clear': '清空',
  'authorChat.directChat': '直接和作者 Agent 讨论',
  'authorChat.capabilities': '可以写正文、改大纲、查设定。',
  'authorChat.features': '支持 /compact 和 /clear。',
  'creativeFlow.label': '创作阶段',
  'creativeFlow.ready': '准备',
  'creativeFlow.current': '当前',
  'creativeFlow.waiting': '等待 Agent 推进创作阶段。',
  'creativeFlow.stage.style_profile': '意图',
  'creativeFlow.stage.story_bible': '设定',
  'creativeFlow.stage.outline': '大纲',
  'creativeFlow.stage.plot_graph': '剧情图',
  'creativeFlow.stage.chapter_draft': '正文',
  'creativeFlow.stage.human_review': '人审',
  'creativeFlow.stage.editorial_review': '慢审',
  'creativeFlow.stage.revision': '修订',
}

function renderAuthorChat() {
  return renderToStaticMarkup(
    <I18nContext.Provider value={{ t: key => labels[key] || key }}>
      <AuthorChatPanel
        currentBook={{ book_id: 'book_a', title: 'Book A' }}
        addToast={() => {}}
        onLoreUpdated={() => {}}
      />
    </I18nContext.Provider>
  )
}

describe('AuthorChatPanel chrome', () => {
  it('keeps legacy workflow chrome out of the chat component', () => {
    const html = renderAuthorChat()

    expect(html).toContain('作者 Agent')
    expect(html).toContain('author-chat-scroll')
    expect(html).not.toContain('creation-notch')
    expect(html).not.toContain('creation-notch-shell')
    expect(html).not.toContain('creation-notch-timeline')
    expect(html).not.toContain('agent-run-timeline')
    expect(html).not.toContain('创作流程')
    expect(html).not.toContain('Context')
  })
})
