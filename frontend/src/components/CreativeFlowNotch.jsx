import { ChevronDown } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../hooks/useI18n'
import { buildStageStates } from './creativeFlowStages'

function StageMarker({ state }) {
  const className = [
    'creation-notch-flow-bar',
    `is-${state}`,
    state === 'current' ? 'is-breathing' : '',
  ].filter(Boolean).join(' ')

  return <span className={className} aria-hidden="true" />
}

export function CreativeFlowNotch({ bookId, refreshKey }) {
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
  const currentStageIndex = Math.max(0, stages.findIndex(stage => stage.id === currentStage?.id))
  const progressPercent = stages.length > 1 ? Math.max(10, Math.round((currentStageIndex / (stages.length - 1)) * 100)) : 100
  const currentLabel = status?.label || t(currentStage?.labelKey || 'creativeFlow.ready')
  const blockers = status?.blockers || []
  const panelNote = error || blockers.slice(0, 2).join(' · ')

  return (
    <section className={`creation-notch ${expanded ? 'expanded' : 'collapsed'}`} aria-label={t('creativeFlow.label')}>
      <button
        type="button"
        className="creation-notch-shell"
        aria-expanded={expanded}
        aria-controls="creation-notch-panel"
        onClick={() => setExpanded(value => !value)}
        style={{ '--creation-progress': `${progressPercent}%` }}
      >
        <span className="creation-notch-balance-spacer" aria-hidden="true" />
        <span className="creation-notch-current">
          <span className="creation-notch-current-label">{currentLabel}</span>
        </span>
        <span className="creation-notch-pull-handle" aria-hidden="true">
          <ChevronDown size={10} strokeWidth={2.25} />
        </span>
        <span className="creation-notch-progress-track" aria-hidden="true">
          <span className="creation-notch-progress-fill is-breathing" />
        </span>
      </button>

      <div id="creation-notch-panel" className="creation-notch-panel" aria-hidden={!expanded}>
        {panelNote && <p className="creation-notch-panel-note">{panelNote}</p>}
        {blockers.length > 0 && (
          <div className="creation-notch-blockers">
            {blockers.slice(0, 2).map(item => <span key={item}>{item}</span>)}
          </div>
        )}
        <ol className="creation-notch-timeline">
          {stages.map(stage => (
            <li key={stage.id} className={`creation-notch-stage ${stage.state}`}>
              <StageMarker state={stage.state} />
              <span>{t(stage.labelKey)}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
