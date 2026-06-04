import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { I18nContext } from '../../i18n/context'
import { WorkspaceTabs } from './WorkspaceTabs'

const labels = {
  'workspace.label': '工作区',
  'workspace.chapter': '章节',
  'workspace.outline': '大纲',
  'workspace.plot': '剧情图',
  'workspace.game': '游戏文案',
}

describe('WorkspaceTabs', () => {
  it('keeps the workspace tabs focused on manuscript surfaces only', () => {
    const html = renderToStaticMarkup(
      <I18nContext.Provider value={{ t: key => labels[key] || key }}>
        <WorkspaceTabs
          activeTab="chapter"
          onTabChange={() => {}}
          chapter={<div>chapter</div>}
          outline={<div>outline</div>}
          plot={<div>plot</div>}
          game={<div>game</div>}
        />
      </I18nContext.Provider>
    )

    expect(html).toContain('章节')
    expect(html).toContain('大纲')
    expect(html).toContain('剧情图')
    expect(html).toContain('游戏文案')
    expect(html).not.toContain('workspace-tab-icon')
    expect(html).not.toContain('aria-hidden="true"')
    expect(html).not.toContain('workspace-flow-slot')
    expect(html).not.toContain('流程图')
  })
})
