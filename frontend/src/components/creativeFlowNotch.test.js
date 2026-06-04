import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { I18nContext } from '../i18n/context'
import { CreativeFlowNotch } from './CreativeFlowNotch'
import { buildStageStates } from './creativeFlowStages'

const labels = {
  'creativeFlow.label': '创作阶段',
  'creativeFlow.ready': '准备',
  'creativeFlow.current': '当前',
  'creativeFlow.waiting': '等待 Agent 推进创作阶段。',
  'creativeFlow.unavailable': '流程状态不可用',
  'creativeFlow.stage.style_profile': '意图',
  'creativeFlow.stage.story_bible': '设定',
  'creativeFlow.stage.outline': '大纲',
  'creativeFlow.stage.plot_graph': '剧情图',
  'creativeFlow.stage.chapter_draft': '正文',
  'creativeFlow.stage.human_review': '人审',
  'creativeFlow.stage.editorial_review': '慢审',
  'creativeFlow.stage.revision': '修订',
}

function renderNotch() {
  return renderToStaticMarkup(
    React.createElement(
      I18nContext.Provider,
      { value: { t: key => labels[key] || key } },
      React.createElement(CreativeFlowNotch, { bookId: 'book_a', loading: false })
    )
  )
}

describe('CreativeFlowNotch stage states', () => {
  it('keeps the lifecycle visually focused on one current stage', () => {
    const stages = buildStageStates({
      stage: 'story_bible',
      metrics: {
        hasStyleProfile: false,
        hasCharacters: false,
        hasWorldLore: false,
      },
    })

    expect(stages.filter(stage => stage.state === 'current').map(stage => stage.id)).toEqual(['story_bible'])
    expect(stages.find(stage => stage.id === 'style_profile')?.state).toBe('done')
  })

  it('shows the current flow directly without current-prefix copy or dot indicators', () => {
    const html = renderNotch()

    expect(html).toContain('creation-notch-flow-bar')
    expect(html).toContain('creation-notch-current')
    expect(html).toContain('creation-notch-balance-spacer')
    expect(html).toContain('creation-notch-current-label')
    expect(html).toContain('creation-notch-progress-track')
    expect(html).toContain('creation-notch-progress-fill')
    expect(html).not.toContain('当前：')
    expect(html).not.toContain('creation-notch-panel-head')
    expect(html).not.toContain('creation-notch-orb')
    expect(html).not.toContain('creation-notch-dot')
  })
})
