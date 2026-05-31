import { describe, expect, it } from 'vitest'
import { summarizeGameOutline, summarizeScriptPackages } from './gameScriptWorkspaceData'

describe('game script workspace data helpers', () => {
  it('summarizes a game outline by arc, story package, and stage', () => {
    const outline = {
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
                { id: 'st_end', label: '收束', type: 'stage', stage_id: 'end' },
              ],
            },
          ],
        },
      ],
    }

    expect(summarizeGameOutline(outline)).toEqual({
      arcCount: 1,
      packageCount: 1,
      stageCount: 2,
      arcs: [
        {
          id: 'arc01',
          label: '第一幕',
          packageCount: 1,
          stageCount: 2,
          packages: [
            {
              id: 'pkg_intro',
              label: '入门剧情包',
              packageId: 'pkg_intro',
              stageCount: 2,
            },
          ],
        },
      ],
    })
  })

  it('summarizes script package totals without relying on chapter concepts', () => {
    const scripts = [
      {
        package_id: 'pkg_intro',
        name: '入门剧情包',
        source_locale: 'zh-CN',
        stage_count: 2,
        line_count: 12,
        choice_count: 3,
        review_states: { approved: 1, draft: 0, review: 1 },
      },
      {
        package_id: 'pkg_daily',
        name: '日常事件',
        source_locale: 'zh-CN',
        stage_count: 1,
        line_count: 8,
        choice_count: 0,
        review_states: { approved: 0, draft: 1, review: 0 },
      },
    ]

    expect(summarizeScriptPackages(scripts)).toEqual({
      packageCount: 2,
      stageCount: 3,
      lineCount: 20,
      choiceCount: 3,
      packages: scripts,
    })
  })
})
