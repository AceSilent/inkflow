export const CREATIVE_FLOW_STAGES = [
  { id: 'style_profile', labelKey: 'creativeFlow.stage.style_profile' },
  { id: 'story_bible', labelKey: 'creativeFlow.stage.story_bible' },
  { id: 'outline', labelKey: 'creativeFlow.stage.outline' },
  { id: 'plot_graph', labelKey: 'creativeFlow.stage.plot_graph' },
  { id: 'chapter_draft', labelKey: 'creativeFlow.stage.chapter_draft' },
  { id: 'human_review', labelKey: 'creativeFlow.stage.human_review' },
  { id: 'editorial_review', labelKey: 'creativeFlow.stage.editorial_review' },
  { id: 'revision', labelKey: 'creativeFlow.stage.revision' },
]

export function buildStageStates(status) {
  const metrics = status?.metrics || {}
  const currentIndex = CREATIVE_FLOW_STAGES.findIndex(stage => stage.id === status?.stage)
  const done = {
    style_profile: Boolean(metrics.hasStyleProfile || metrics.hasCharacters || metrics.hasWorldLore || metrics.hasOutline),
    story_bible: Boolean(metrics.hasCharacters && metrics.hasWorldLore),
    outline: Boolean(metrics.hasOutline),
    plot_graph: Boolean((metrics.plotNodes || 0) >= 4 && (metrics.plotEdges || 0) >= 1),
    chapter_draft: Boolean(metrics.hasFirstDraft),
    human_review: Boolean(metrics.firstHumanApproved),
    editorial_review: Boolean(metrics.hasFirstReview),
    revision: Boolean(metrics.firstHumanApproved),
  }

  return CREATIVE_FLOW_STAGES.map((stage, index) => {
    let state = done[stage.id] ? 'done' : 'todo'
    if (currentIndex > index) state = 'done'
    if (currentIndex === index) state = 'current'
    if (status?.stage === 'revision' && stage.id === 'revision') state = metrics.firstHumanApproved ? 'done' : 'blocked'
    return { ...stage, state }
  })
}
