import { describe, expect, it } from 'vitest'
import { StoryPackageSchema } from '../../src/schemas/index.js'

describe('game script schema', () => {
  it('preserves localization, review, condition, and effect metadata', () => {
    const pkg = StoryPackageSchema.parse({
      id: 'quest_intro',
      name: '入门任务',
      author: 'InkFlow',
      motif: 'choice',
      tier: 'short',
      description: '测试结构化游戏文案字段。',
      engine: 'unity',
      export_targets: ['json', 'csv'],
      variables: { trust: 0 },
      assets: { bgm_intro: { type: 'bgm' } },
      stages: [{
        id: 'start',
        summary: '玩家遇到委托人',
        review_state: 'review',
        conditions: { flag_met_npc: true },
        effects: { set_flag: 'accepted_intro' },
        lines: [{
          id: 'quest_intro.start.001',
          speaker: '阿青',
          text: '你来得正好。',
          intent: '交付任务目标',
          subtext: '她在隐瞒危险',
          loc_state: 'review',
          notes: [{ text: '后续可缩短给配音版。' }],
          tags: ['quest_hook'],
        }],
        choices: [{
          id: 'ask',
          label: '询问细节',
          next_stage: 'ask_more',
          conditions: { trust: { gte: 1 } },
          effects: { trust: 1 },
        }],
      }, {
        id: 'ask_more',
        lines: [{ id: 'quest_intro.ask_more.001', text: '她压低声音，说出了失踪者的名字。' }],
      }],
    })

    expect(pkg.engine).toBe('unity')
    expect(pkg.export_targets).toEqual(['json', 'csv'])
    expect(pkg.stages[0].review_state).toBe('review')
    expect(pkg.stages[0].choices[0].conditions).toEqual({ trust: { gte: 1 } })
    expect(pkg.stages[0].choices[0].effects).toEqual({ trust: 1 })
    expect(pkg.stages[0].lines[0].loc_key).toBe('quest_intro.start.001')
    expect(pkg.stages[0].lines[0].loc_state).toBe('review')
    expect(pkg.stages[0].lines[0].notes[0].status).toBe('open')
  })
})
