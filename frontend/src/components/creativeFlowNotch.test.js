import { describe, expect, it } from 'vitest'
import { buildStageStates } from './creativeFlowStages'

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
})
