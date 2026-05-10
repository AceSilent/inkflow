import { AlertCircle, CheckCircle2, Circle, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

const STAGES = [
  { id: 'style_profile', label: '文风/意图' },
  { id: 'story_bible', label: '设定库' },
  { id: 'outline', label: '大纲' },
  { id: 'plot_graph', label: '剧情图' },
  { id: 'chapter_draft', label: '正文' },
  { id: 'human_review', label: '人审' },
  { id: 'editorial_review', label: '慢审' },
  { id: 'revision', label: '修订' },
]

function buildStageStates(status) {
  const m = status?.metrics || {}
  const done = {
    style_profile: Boolean(m.hasStyleProfile || m.hasCharacters || m.hasWorldLore || m.hasOutline),
    story_bible: Boolean(m.hasCharacters && m.hasWorldLore),
    outline: Boolean(m.hasOutline),
    plot_graph: Boolean((m.plotNodes || 0) >= 4 && (m.plotEdges || 0) >= 1),
    chapter_draft: Boolean(m.hasFirstDraft),
    human_review: Boolean(m.firstHumanApproved),
    editorial_review: Boolean(m.hasFirstReview),
    revision: Boolean(m.firstHumanApproved),
  }

  return STAGES.map((stage) => {
    let state = done[stage.id] ? 'done' : 'todo'
    if (status?.stage === stage.id) state = done[stage.id] ? 'done' : 'current'
    if (status?.stage === 'story_bible' && stage.id === 'style_profile' && !done.style_profile) state = 'current'
    if (status?.stage === 'revision' && stage.id === 'revision') state = m.firstHumanApproved ? 'done' : 'blocked'
    return { ...stage, state }
  })
}

function StageIcon({ state, loading }) {
  if (loading && state === 'current') return <Loader2 size={13} className="creative-stage-spin" />
  if (state === 'done') return <CheckCircle2 size={13} />
  if (state === 'blocked') return <AlertCircle size={13} />
  return <Circle size={13} />
}

export function CreativeStageBar({ bookId, refreshKey, loading }) {
  const [status, setStatus] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!bookId) return
    let cancelled = false
    fetch(`/api/v1/books/${bookId}/creative-stage`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('creative-stage failed')))
      .then(data => {
        if (cancelled) return
        setStatus(data)
        setError('')
      })
      .catch(() => {
        if (!cancelled) setError('阶段状态暂不可用')
      })
    return () => { cancelled = true }
  }, [bookId, refreshKey])

  const stages = useMemo(() => buildStageStates(status), [status])
  const currentLabel = status?.label || '准备'
  const nextAction = status?.nextAction || '等待开始创作流程。'
  const blockers = status?.blockers || []

  return (
    <section className="creative-stage-bar" aria-label="创作阶段">
      <div className="creative-stage-main">
        <div className="creative-stage-head">
          <span className="creative-stage-kicker">创作流程</span>
          <strong>{error || `当前：${currentLabel}`}</strong>
        </div>
        <div className="creative-stage-next">{nextAction}</div>
        {blockers.length > 0 && (
          <div className="creative-stage-blockers">
            {blockers.slice(0, 2).map((item) => <span key={item}>{item}</span>)}
          </div>
        )}
      </div>
      <ol className="creative-stage-steps">
        {stages.map((stage) => (
          <li key={stage.id} className={`creative-stage-step ${stage.state}`}>
            <StageIcon state={stage.state} loading={loading} />
            <span>{stage.label}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
