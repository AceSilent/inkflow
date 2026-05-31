import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { I18nContext } from '../../i18n/context'
import { GameScriptWorkspaceView } from './GameScriptWorkspace'

const labels = {
  'gameWorkspace.empty': '选择作品后查看游戏文案',
  'gameWorkspace.error': '游戏文案读取失败',
  'gameWorkspace.loading': '正在读取游戏文案',
  'gameWorkspace.title': '游戏文案',
  'gameWorkspace.kicker': '交互叙事',
  'gameWorkspace.arcs': '幕',
  'gameWorkspace.packages': '剧情包',
  'gameWorkspace.stages': '阶段',
  'gameWorkspace.lines': '台词',
  'gameWorkspace.choices': '选项',
  'gameWorkspace.outline': '结构',
  'gameWorkspace.scripts': '脚本包',
  'gameWorkspace.noOutline': '暂无结构',
  'gameWorkspace.noScripts': '暂无脚本包',
  'gameWorkspace.locale': '语言',
}

function renderWithI18n(node) {
  return renderToStaticMarkup(
    <I18nContext.Provider value={{ t: key => labels[key] || key }}>
      {node}
    </I18nContext.Provider>
  )
}

describe('GameScriptWorkspaceView', () => {
  it('renders game outline and script package summaries', () => {
    const html = renderWithI18n(
      <GameScriptWorkspaceView
        currentBook={{ book_id: 'game-book', title: '灵境奇谭' }}
        loading={false}
        loadError={false}
        outline={{
          id: 'game-book',
          label: '灵境奇谭',
          type: 'game_project',
          children: [
            {
              id: 'arc01',
              label: '第一幕',
              type: 'arc',
              children: [
                {
                  id: 'pkg_intro',
                  label: '入门剧情包',
                  type: 'story_package',
                  package_id: 'pkg_intro',
                  children: [
                    { id: 'st_start', label: '开场', type: 'stage', stage_id: 'start' },
                  ],
                },
              ],
            },
          ],
        }}
        scripts={[
          {
            package_id: 'pkg_intro',
            name: '入门剧情包',
            source_locale: 'zh-CN',
            stage_count: 1,
            line_count: 12,
            choice_count: 2,
            review_states: { approved: 0, draft: 1, review: 0 },
          },
        ]}
      />
    )

    expect(html).toContain('游戏文案')
    expect(html).toContain('灵境奇谭')
    expect(html).toContain('第一幕')
    expect(html).toContain('入门剧情包')
    expect(html).toContain('12')
    expect(html).toContain('zh-CN')
  })

  it('shows an empty state without a selected work', () => {
    const html = renderWithI18n(
      <GameScriptWorkspaceView
        currentBook={null}
        loading={false}
        loadError={false}
        outline={null}
        scripts={[]}
      />
    )

    expect(html).toContain('选择作品后查看游戏文案')
  })
})
