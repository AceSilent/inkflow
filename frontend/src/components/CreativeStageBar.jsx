import { AlertCircle, CheckCircle2, Circle, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

const STAGES = [
  { id: 'world_bible', label: '世界圣经' },
  { id: 'story_outline', label: '故事大纲' },
  { id: 'script_draft', label: '剧本草稿' },
  { id: 'self_check', label: '自检' },
  { id: 'review', label: '审核' },
  { id: 'export', label: '导出' },
]

function buildStageStates(status) {
  const m = status?.metrics || {}
  const done = {
    world_bible: Boolean(m.hasCharacters && m.hasWorldLore),
    story_outline: Boolean(m.hasOutline),
    script_draft: Boolean(m.hasFirstDraft),
    self_check: Boolean(m.selfCheckPassed),
    review: Boolean(m.hasFirstReview),
    export: Boolean(m.hasExport),
  }

  return STAGES.map((stage) => {
    let state = done[stage.id] ? 'done' : 'todo'
    if (status?.stage === stage.id) state = done[stage.id] ? 'done' : 'current'
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
