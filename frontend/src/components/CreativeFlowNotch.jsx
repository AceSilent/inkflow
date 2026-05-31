import { AlertCircle, Check, ChevronDown, Circle, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../hooks/useI18n'
import { buildStageStates } from './creativeFlowStages'

function StageGlyph({ state, loading }) {
  if (loading && state === 'current') return <Loader2 size={12} className="creation-notch-spin" />
  if (state === 'done') return <Check size={12} />
  if (state === 'blocked') return <AlertCircle size={12} />
  return <Circle size={12} />
}

export function CreativeFlowNotch({ bookId, refreshKey, loading }) {
  const { t } = useI18n()
  const [stageStatus, setStageStatus] = useState({ bookId: null, data: null, error: '' })
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!bookId) return

    let cancelled = false
    fetch(`/api/v1/books/${bookId}/creative-stage`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('creative-stage failed')))
      .then(data => {
        if (cancelled) return
        setStageStatus({ bookId, data, error: '' })
      })
      .catch(() => {
        if (!cancelled) setStageStatus({ bookId, data: null, error: t('creativeFlow.unavailable') })
      })

    return () => { cancelled = true }
  }, [bookId, refreshKey, t])

  const status = stageStatus.bookId === bookId ? stageStatus.data : null
  const error = stageStatus.bookId === bookId ? stageStatus.error : ''
  const stages = useMemo(() => buildStageStates(status), [status])
  if (!bookId) return null

  const currentStage = stages.find(stage => stage.state === 'current') || stages.find(stage => stage.state === 'todo') || stages[0]
  const currentLabel = status?.label || t(currentStage?.labelKey || 'creativeFlow.ready')
  const summary = error || status?.nextAction || t('creativeFlow.waiting')
  const blockers = status?.blockers || []

  return (
    <section className={`creation-notch ${expanded ? 'expanded' : 'collapsed'}`} aria-label={t('creativeFlow.label')}>
      <button
        type="button"
        className="creation-notch-shell"
        aria-expanded={expanded}
        aria-controls="creation-notch-panel"
        onClick={() => setExpanded(value => !value)}
      >
        <span className="creation-notch-current">
          <span className="creation-notch-orb" />
          <span>{t('creativeFlow.current')}：{currentLabel}</span>
        </span>
        <span className="creation-notch-summary">{summary}</span>
        <span className="creation-notch-pull-handle" aria-hidden="true">
          <ChevronDown size={13} />
        </span>
      </button>

      <div id="creation-notch-panel" className="creation-notch-panel" aria-hidden={!expanded}>
        <div className="creation-notch-panel-head">
          <span>{currentLabel}</span>
          <p>{summary}</p>
        </div>
        {blockers.length > 0 && (
          <div className="creation-notch-blockers">
            {blockers.slice(0, 2).map(item => <span key={item}>{item}</span>)}
          </div>
        )}
        <ol className="creation-notch-timeline">
          {stages.map(stage => (
            <li key={stage.id} className={`creation-notch-stage ${stage.state}`}>
              <span className="creation-notch-dot">
                <StageGlyph state={stage.state} loading={loading} />
              </span>
              <span>{t(stage.labelKey)}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
